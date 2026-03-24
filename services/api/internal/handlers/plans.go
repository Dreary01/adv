package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PlanHandler struct {
	db *pgxpool.Pool
}

func NewPlanHandler(db *pgxpool.Pool) *PlanHandler {
	return &PlanHandler{db: db}
}

// GetPlans returns all plans for an object + computed forecast
func (h *PlanHandler) GetPlans(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	// Load object status and actual dates
	var status string
	var actualStart, actualEnd *string
	err := h.db.QueryRow(context.Background(),
		`SELECT status, actual_start_date::text, actual_end_date::text FROM objects WHERE id = $1 AND workspace_id = $2`, id, wsID,
	).Scan(&status, &actualStart, &actualEnd)
	if err != nil {
		writeError(w, http.StatusNotFound, "object not found")
		return
	}

	// Load stored plans
	rows, err := h.db.Query(context.Background(),
		`SELECT id, object_id, plan_type, start_date::text, end_date::text, duration_days, effort_hours
		 FROM object_plans WHERE object_id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var plans []models.Plan
	var operational *models.Plan
	for rows.Next() {
		var p models.Plan
		rows.Scan(&p.ID, &p.ObjectID, &p.PlanType, &p.StartDate, &p.EndDate, &p.DurationDays, &p.EffortHours)
		plans = append(plans, p)
		if p.PlanType == "operational" {
			cp := p
			operational = &cp
		}
	}

	// Check if this is a summary object (has children) — aggregate from descendants
	var childCount int
	h.db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM objects WHERE parent_id = $1 AND workspace_id = $2`, id, wsID).Scan(&childCount)

	if childCount > 0 && operational == nil {
		// Compute aggregated dates from all descendants
		var aggStart, aggEnd *string
		h.db.QueryRow(context.Background(),
			`WITH RECURSIVE subtree AS (
				SELECT id FROM objects WHERE parent_id = $1 AND workspace_id = $2
				UNION ALL
				SELECT o.id FROM objects o JOIN subtree s ON o.parent_id = s.id WHERE o.workspace_id = $2
			)
			SELECT MIN(p.start_date)::text, MAX(p.end_date)::text
			FROM object_plans p
			WHERE p.object_id IN (SELECT id FROM subtree) AND p.plan_type = 'operational' AND p.workspace_id = $2`,
			id, wsID).Scan(&aggStart, &aggEnd)

		if aggStart != nil || aggEnd != nil {
			var dur *int
			if aggStart != nil && aggEnd != nil {
				d := businessDaysBetween(parseDate(*aggStart), parseDate(*aggEnd))
				dur = &d
			}
			aggPlan := models.Plan{
				ObjectID:     id,
				PlanType:     "operational",
				StartDate:    aggStart,
				EndDate:      aggEnd,
				DurationDays: dur,
			}
			plans = append(plans, aggPlan)
			operational = &aggPlan
		}
	}

	// Compute forecast
	forecast := computeForecast(id, status, actualStart, operational)
	if forecast != nil {
		plans = append(plans, *forecast)
	}

	if plans == nil {
		plans = []models.Plan{}
	}
	writeJSON(w, http.StatusOK, plans)
}

// UpsertOperational creates or updates operational plan
func (h *PlanHandler) UpsertOperational(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	// Only admin or manager can change dates
	wsRole := middleware.GetWorkspaceRole(r.Context())
	if wsRole != "admin" {
		userID := middleware.GetUserID(r.Context())
		if !IsManager(h.db, r.Context(), id, userID) {
			writeError(w, http.StatusForbidden, "only managers can change dates")
			return
		}
	}

	var req models.UpdatePlanRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	// Auto-calculate missing field
	if req.StartDate != nil && req.DurationDays != nil && req.EndDate == nil {
		end := addBusinessDays(parseDate(*req.StartDate), *req.DurationDays)
		s := end.Format("2006-01-02")
		req.EndDate = &s
	} else if req.EndDate != nil && req.DurationDays != nil && req.StartDate == nil {
		start := subtractBusinessDays(parseDate(*req.EndDate), *req.DurationDays)
		s := start.Format("2006-01-02")
		req.StartDate = &s
	} else if req.StartDate != nil && req.EndDate != nil && req.DurationDays == nil {
		d := businessDaysBetween(parseDate(*req.StartDate), parseDate(*req.EndDate))
		req.DurationDays = &d
	}

	var p models.Plan
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO object_plans (workspace_id, object_id, plan_type, start_date, end_date, duration_days, effort_hours)
		 VALUES ($1, $2, 'operational', $3, $4, $5, $6)
		 ON CONFLICT (object_id, plan_type) DO UPDATE SET
			start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
			duration_days = EXCLUDED.duration_days, effort_hours = EXCLUDED.effort_hours,
			updated_at = NOW()
		 RETURNING id, object_id, plan_type, start_date::text, end_date::text, duration_days, effort_hours`,
		wsID, id, req.StartDate, req.EndDate, req.DurationDays, req.EffortHours,
	).Scan(&p.ID, &p.ObjectID, &p.PlanType, &p.StartDate, &p.EndDate, &p.DurationDays, &p.EffortHours)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "upsert plan failed: "+err.Error())
		return
	}

	// Cascade: shift dependent tasks based on dependency links
	h.cascadeDependencies(wsID, id, p.StartDate, p.EndDate)

	writeJSON(w, http.StatusOK, p)
}

// CreateBaseline snapshots operational → baseline
func (h *PlanHandler) CreateBaseline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var p models.Plan
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO object_plans (workspace_id, object_id, plan_type, start_date, end_date, duration_days, effort_hours)
		 SELECT workspace_id, object_id, 'baseline', start_date, end_date, duration_days, effort_hours
		 FROM object_plans WHERE object_id = $1 AND plan_type = 'operational' AND workspace_id = $2
		 ON CONFLICT (object_id, plan_type) DO UPDATE SET
			start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
			duration_days = EXCLUDED.duration_days, effort_hours = EXCLUDED.effort_hours,
			updated_at = NOW()
		 RETURNING id, object_id, plan_type, start_date::text, end_date::text, duration_days, effort_hours`,
		id, wsID,
	).Scan(&p.ID, &p.ObjectID, &p.PlanType, &p.StartDate, &p.EndDate, &p.DurationDays, &p.EffortHours)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create baseline failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

// DeleteBaseline removes baseline plan
func (h *PlanHandler) DeleteBaseline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(),
		`DELETE FROM object_plans WHERE object_id = $1 AND plan_type = 'baseline' AND workspace_id = $2`, id, wsID)
	w.WriteHeader(http.StatusNoContent)
}

// ─── Dependency Cascade ─────────────────────────────────

// cascadeDependencies shifts successor tasks when a predecessor's dates change.
// For each dependency from this task, ensures the successor doesn't start before
// the predecessor ends (for FS) + lag days.
func (h *PlanHandler) cascadeDependencies(wsID, predecessorID string, predStart, predEnd *string) {
	if predEnd == nil && predStart == nil {
		return
	}

	// Find all dependencies where this task is the predecessor
	rows, err := h.db.Query(context.Background(),
		`SELECT d.successor_id, d.type, d.lag_days
		 FROM dependencies d WHERE d.predecessor_id = $1 AND d.workspace_id = $2`, predecessorID, wsID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var successorID, depType string
		var lagDays int
		if err := rows.Scan(&successorID, &depType, &lagDays); err != nil {
			continue
		}

		// Load successor's current plan
		var succStart, succEnd *string
		var succDuration *int
		h.db.QueryRow(context.Background(),
			`SELECT start_date::text, end_date::text, duration_days
			 FROM object_plans WHERE object_id = $1 AND plan_type = 'operational' AND workspace_id = $2`,
			successorID, wsID).Scan(&succStart, &succEnd, &succDuration)

		if succStart == nil {
			continue
		}

		// Calculate the earliest allowed start for successor
		var earliestStart time.Time
		switch depType {
		case "fs": // Finish-to-Start: successor starts after predecessor ends
			if predEnd != nil {
				earliestStart = addBusinessDays(parseDate(*predEnd), lagDays+1)
			}
		case "ss": // Start-to-Start: successor starts after predecessor starts
			if predStart != nil {
				earliestStart = addBusinessDays(parseDate(*predStart), lagDays)
			}
		case "ff": // Finish-to-Finish: successor ends after predecessor ends
			// Shift start so end aligns
			if predEnd != nil && succDuration != nil {
				earliestEnd := addBusinessDays(parseDate(*predEnd), lagDays)
				earliestStart = subtractBusinessDays(earliestEnd, *succDuration)
			}
		case "sf": // Start-to-Finish: successor ends after predecessor starts
			if predStart != nil && succDuration != nil {
				earliestEnd := addBusinessDays(parseDate(*predStart), lagDays)
				earliestStart = subtractBusinessDays(earliestEnd, *succDuration)
			}
		default:
			continue
		}

		if earliestStart.IsZero() {
			continue
		}

		// Only shift if successor currently starts too early
		currentStart := parseDate(*succStart)
		if currentStart.Before(earliestStart) {
			newStart := earliestStart.Format("2006-01-02")
			dur := 1
			if succDuration != nil && *succDuration > 0 {
				dur = *succDuration
			}
			newEnd := addBusinessDays(earliestStart, dur).Format("2006-01-02")

			h.db.Exec(context.Background(),
				`UPDATE object_plans SET start_date = $1, end_date = $2, updated_at = NOW()
				 WHERE object_id = $3 AND plan_type = 'operational' AND workspace_id = $4`,
				newStart, newEnd, successorID, wsID)

			// Recurse: this successor may have its own dependents
			h.cascadeDependencies(wsID, successorID, &newStart, &newEnd)
		}
	}
}

// ─── Business Day Helpers ───────────────────────────────

func parseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func isBusinessDay(t time.Time) bool {
	wd := t.Weekday()
	return wd != time.Saturday && wd != time.Sunday
}

func businessDaysBetween(start, end time.Time) int {
	if end.Before(start) {
		return 0
	}
	count := 0
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		if isBusinessDay(d) {
			count++
		}
	}
	return count
}

func addBusinessDays(start time.Time, days int) time.Time {
	if days <= 0 {
		return start
	}
	d := start
	added := 0
	for added < days {
		d = d.AddDate(0, 0, 1)
		if isBusinessDay(d) {
			added++
		}
	}
	return d
}

func subtractBusinessDays(end time.Time, days int) time.Time {
	if days <= 0 {
		return end
	}
	d := end
	subtracted := 0
	for subtracted < days {
		d = d.AddDate(0, 0, -1)
		if isBusinessDay(d) {
			subtracted++
		}
	}
	return d
}

// ─── Forecast Computation ───────────────────────────────

func computeForecast(objectID, status string, actualStart *string, operational *models.Plan) *models.Plan {
	if operational == nil {
		return nil
	}

	forecast := models.Plan{
		ObjectID: objectID,
		PlanType: "forecast",
	}
	today := time.Now().Format("2006-01-02")

	switch status {
	case "not_started":
		// Forecast = operational
		forecast.StartDate = operational.StartDate
		forecast.EndDate = operational.EndDate
		forecast.DurationDays = operational.DurationDays

	case "in_progress":
		if actualStart != nil {
			forecast.StartDate = actualStart
			// Remaining duration
			if operational.DurationDays != nil && *operational.DurationDays > 0 {
				elapsed := 0
				if operational.StartDate != nil {
					elapsed = businessDaysBetween(parseDate(*operational.StartDate), parseDate(today))
				}
				remaining := *operational.DurationDays - elapsed
				if remaining < 1 {
					remaining = 1
				}
				end := addBusinessDays(parseDate(today), remaining)
				endStr := end.Format("2006-01-02")
				forecast.EndDate = &endStr
				dur := businessDaysBetween(parseDate(*actualStart), end)
				forecast.DurationDays = &dur
			} else {
				forecast.EndDate = operational.EndDate
			}
		} else {
			forecast.StartDate = &today
			forecast.EndDate = operational.EndDate
		}

	case "completed":
		forecast.StartDate = actualStart
		// Actual end is the fact, not a forecast
		return nil

	default:
		forecast.StartDate = operational.StartDate
		forecast.EndDate = operational.EndDate
	}

	return &forecast
}
