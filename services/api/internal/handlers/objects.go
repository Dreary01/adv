package handlers

import (
	"context"
	"fmt"
	"net/http"

	"github.com/custle/api/internal/access"
	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ObjectHandler struct {
	db        *pgxpool.Pool
	accessSvc *access.Service
}

func NewObjectHandler(db *pgxpool.Pool, accessSvc *access.Service) *ObjectHandler {
	return &ObjectHandler{db: db, accessSvc: accessSvc}
}

func (h *ObjectHandler) canAccess(r *http.Request, objectID string, action int) bool {
	wsRole := middleware.GetWorkspaceRole(r.Context())
	if wsRole == "admin" {
		return true
	}
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())
	return h.accessSvc.CheckAccess(r.Context(), userID, wsID, access.ResourceObject, objectID, action)
}

func (h *ObjectHandler) List(w http.ResponseWriter, r *http.Request) {
	parentID := r.URL.Query().Get("parent_id")
	typeID := r.URL.Query().Get("type_id")
	status := r.URL.Query().Get("status")

	wsID := middleware.GetWorkspaceID(r.Context())
	wsRole := middleware.GetWorkspaceRole(r.Context())
	ctePrefix := ""
	aclFrom := ""
	aclWhere := ""
	if wsRole != "admin" {
		userID := middleware.GetUserID(r.Context())
		ctePrefix, aclFrom, aclWhere = h.accessSvc.AccessFilterCTE(userID, wsID)
	}

	// Light mode: skip heavy fields (field_values, description) for list views
	query := `SELECT o.id, o.type_id, o.parent_id, o.name, o.code,
	                  o.status, o.priority, o.progress,
	                  o.sort_order, o.depth, o.owner_id, o.assignee_id,
	                  o.created_at, o.updated_at,
	                  t.name, t.kind, t.color, t.icon,
	                  o.actual_start_date::text, o.actual_end_date::text,
	                  p.start_date::text, p.end_date::text, p.duration_days,
	                  ua.first_name || ' ' || ua.last_name
	           FROM objects o
	           JOIN object_types t ON t.id = o.type_id
	           LEFT JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
	           LEFT JOIN users ua ON ua.id = o.assignee_id` + aclFrom + `
	           WHERE o.workspace_id = $1`
	args := []interface{}{wsID}
	argN := 2

	if aclWhere != "" {
		query += ` AND ` + aclWhere
	}

	if parentID == "root" || parentID == "" {
		query += ` AND o.parent_id IS NULL`
	} else if parentID != "all" {
		query += ` AND o.parent_id = $` + itoa(argN)
		args = append(args, parentID)
		argN++
	}

	if typeID != "" {
		query += ` AND o.type_id = $` + itoa(argN)
		args = append(args, typeID)
		argN++
	}
	if status != "" {
		query += ` AND o.status = $` + itoa(argN)
		args = append(args, status)
		argN++
	}

	query += ` ORDER BY o.sort_order, o.created_at`

	rows, err := h.db.Query(context.Background(), ctePrefix+query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var objects []models.Object
	for rows.Next() {
		var o models.Object
		if err := rows.Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code,
			&o.Status, &o.Priority, &o.Progress,
			&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
			&o.CreatedAt, &o.UpdatedAt,
			&o.TypeName, &o.TypeKind, &o.TypeColor, &o.TypeIcon,
			&o.ActualStart, &o.ActualEnd,
			&o.PlanStart, &o.PlanEnd, &o.PlanDuration,
			&o.AssigneeName); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		objects = append(objects, o)
	}
	if objects == nil {
		objects = []models.Object{}
	}
	writeJSONList(w, objects, len(objects))
}

func (h *ObjectHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	wsRole := middleware.GetWorkspaceRole(r.Context())
	ctePrefix := ""
	aclFrom := ""
	aclWhere := ""
	if wsRole != "admin" {
		userID := middleware.GetUserID(r.Context())
		ctePrefix, aclFrom, aclWhere = h.accessSvc.AccessFilterCTE(userID, wsID)
	}

	// Light fields only — no field_values, description, created_by
	query := `SELECT o.id, o.type_id, o.parent_id, o.name, o.code,
		        o.status, o.priority, o.progress,
		        o.sort_order, o.depth, o.owner_id, o.assignee_id,
		        o.created_at, o.updated_at,
		        t.name, t.kind, t.color, t.icon,
		        o.actual_start_date::text, o.actual_end_date::text,
		        p.start_date::text, p.end_date::text, p.duration_days,
		        ua.first_name || ' ' || ua.last_name
		 FROM objects o
		 JOIN object_types t ON t.id = o.type_id
		 LEFT JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
		 LEFT JOIN users ua ON ua.id = o.assignee_id` + aclFrom + `
		 WHERE o.workspace_id = $1`
	if aclWhere != "" {
		query += ` AND ` + aclWhere
	}
	query += ` ORDER BY o.sort_order, o.created_at`
	rows, err := h.db.Query(context.Background(), ctePrefix+query, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	all := map[string]*models.Object{}
	var roots []*models.Object
	var ordered []string

	for rows.Next() {
		var o models.Object
		if err := rows.Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code,
			&o.Status, &o.Priority, &o.Progress,
			&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
			&o.CreatedAt, &o.UpdatedAt,
			&o.TypeName, &o.TypeKind, &o.TypeColor, &o.TypeIcon,
			&o.ActualStart, &o.ActualEnd,
			&o.PlanStart, &o.PlanEnd, &o.PlanDuration,
			&o.AssigneeName); err != nil {
			continue
		}
		obj := o
		all[o.ID] = &obj
		ordered = append(ordered, o.ID)
	}

	for _, id := range ordered {
		o := all[id]
		if o.ParentID == nil {
			roots = append(roots, o)
		} else if parent, ok := all[*o.ParentID]; ok {
			parent.Children = append(parent.Children, o)
		}
	}

	if roots == nil {
		roots = []*models.Object{}
	}
	writeJSON(w, http.StatusOK, roots)
}

func (h *ObjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canAccess(r, id, access.ActionRead) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	var o models.Object
	err := h.db.QueryRow(context.Background(),
		`SELECT o.id, o.type_id, o.parent_id, o.name, o.code, o.description,
		        o.status, o.priority, o.progress, o.field_values,
		        o.sort_order, o.depth, o.owner_id, o.assignee_id,
		        o.created_at, o.updated_at, o.created_by,
		        t.name, t.kind, t.color, t.icon,
		        o.actual_start_date::text, o.actual_end_date::text,
		        uo.first_name || ' ' || uo.last_name,
		        ua.first_name || ' ' || ua.last_name
		 FROM objects o
		 JOIN object_types t ON t.id = o.type_id
		 LEFT JOIN users uo ON uo.id = o.owner_id
		 LEFT JOIN users ua ON ua.id = o.assignee_id
		 WHERE o.id = $1`, id,
	).Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code, &o.Description,
		&o.Status, &o.Priority, &o.Progress, &o.FieldValues,
		&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
		&o.CreatedAt, &o.UpdatedAt, &o.CreatedBy,
		&o.TypeName, &o.TypeKind, &o.TypeColor, &o.TypeIcon,
		&o.ActualStart, &o.ActualEnd,
		&o.OwnerName, &o.AssigneeName)
	if err != nil {
		writeError(w, http.StatusNotFound, "object not found")
		return
	}

	// load plans
	planRows, _ := h.db.Query(context.Background(),
		`SELECT id, object_id, plan_type, start_date, end_date, duration_days, effort_hours
		 FROM object_plans WHERE object_id = $1`, id)
	if planRows != nil {
		defer planRows.Close()
		for planRows.Next() {
			var p models.Plan
			planRows.Scan(&p.ID, &p.ObjectID, &p.PlanType, &p.StartDate, &p.EndDate, &p.DurationDays, &p.EffortHours)
			o.Plans = append(o.Plans, p)
		}
	}

	// load children
	childRows, _ := h.db.Query(context.Background(),
		`SELECT o.id, o.type_id, o.parent_id, o.name, o.code, o.description,
		        o.status, o.priority, o.progress, o.field_values,
		        o.sort_order, o.depth, o.owner_id, o.assignee_id,
		        o.created_at, o.updated_at, o.created_by,
		        t.name, t.kind, t.color, t.icon,
		        o.actual_start_date, o.actual_end_date
		 FROM objects o JOIN object_types t ON t.id = o.type_id
		 WHERE o.parent_id = $1 ORDER BY o.sort_order`, id)
	if childRows != nil {
		defer childRows.Close()
		for childRows.Next() {
			var c models.Object
			childRows.Scan(&c.ID, &c.TypeID, &c.ParentID, &c.Name, &c.Code, &c.Description,
				&c.Status, &c.Priority, &c.Progress, &c.FieldValues,
				&c.SortOrder, &c.Depth, &c.OwnerID, &c.AssigneeID,
				&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy,
				&c.TypeName, &c.TypeKind, &c.TypeColor, &c.TypeIcon,
				&c.ActualStart, &c.ActualEnd)
			o.Children = append(o.Children, &c)
		}
	}

	writeJSON(w, http.StatusOK, o)
}

func (h *ObjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateObjectRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Check create permission on parent (if has parent)
	if req.ParentID != nil && *req.ParentID != "" {
		if !h.canAccess(r, *req.ParentID, access.ActionCreate) {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}
	}
	if req.Name == "" || req.TypeID == "" {
		writeError(w, http.StatusBadRequest, "name and type_id are required")
		return
	}
	if req.Status == "" {
		req.Status = "not_started"
	}
	if req.FieldValues == nil {
		req.FieldValues = []byte("{}")
	}

	userIDStr := middleware.GetUserID(r.Context())
	var userID *string
	if userIDStr != "" {
		userID = &userIDStr
	}

	var depth int
	if req.ParentID != nil {
		h.db.QueryRow(context.Background(),
			`SELECT depth FROM objects WHERE id = $1`, *req.ParentID).Scan(&depth)
		depth++
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	var o models.Object
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO objects (workspace_id, type_id, parent_id, name, code, description, status, priority,
		                      field_values, assignee_id, depth, created_by, owner_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
		 RETURNING id, type_id, parent_id, name, code, description, status, priority,
		           progress, field_values, sort_order, depth, owner_id, assignee_id,
		           created_at, updated_at, created_by,
		           actual_start_date::text, actual_end_date::text`,
		wsID, req.TypeID, req.ParentID, req.Name, req.Code, req.Description, req.Status,
		req.Priority, req.FieldValues, req.AssigneeID, depth, userID,
	).Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code, &o.Description,
		&o.Status, &o.Priority, &o.Progress, &o.FieldValues,
		&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
		&o.CreatedAt, &o.UpdatedAt, &o.CreatedBy,
		&o.ActualStart, &o.ActualEnd)

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, o)
}

func (h *ObjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canAccess(r, id, access.ActionUpdate) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}
	var req models.CreateObjectRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FieldValues == nil {
		req.FieldValues = []byte("{}")
	}

	// Read current status for date logic
	var currentStatus string
	if err := h.db.QueryRow(context.Background(),
		`SELECT status FROM objects WHERE id = $1`, id).Scan(&currentStatus); err != nil {
		writeError(w, http.StatusNotFound, "object not found")
		return
	}

	newStatus := req.Status
	if newStatus == "" {
		newStatus = currentStatus
	}

	// Build actual date expressions based on status transition
	actualStartExpr := "actual_start_date"
	actualEndExpr := "actual_end_date"

	if newStatus == "in_progress" && currentStatus != "in_progress" {
		// Transitioning TO in_progress: set start date if null
		actualStartExpr = "COALESCE(actual_start_date, CURRENT_DATE)"
	}
	if newStatus == "completed" && currentStatus != "completed" {
		// Transitioning TO completed: set end date
		actualEndExpr = "CURRENT_DATE"
	}
	if currentStatus == "completed" && newStatus != "completed" {
		// Transitioning FROM completed: clear end date
		actualEndExpr = "NULL"
	}
	if currentStatus == "in_progress" && newStatus == "not_started" {
		// Transitioning FROM in_progress to not_started: clear start date
		actualStartExpr = "NULL"
	}

	var o models.Object
	err := h.db.QueryRow(context.Background(),
		`UPDATE objects SET
			name = COALESCE(NULLIF($1, ''), name),
			code = $2, description = $3,
			status = COALESCE(NULLIF($4::text, '')::object_status, status),
			priority = $5, field_values = $6,
			assignee_id = $7, updated_at = NOW(),
			progress = CASE WHEN COALESCE(NULLIF($4::text, '')::object_status, status) = 'completed' THEN 100
			                WHEN COALESCE(NULLIF($4::text, '')::object_status, status) = 'not_started' THEN 0
			                ELSE progress END,
			actual_start_date = `+actualStartExpr+`,
			actual_end_date = `+actualEndExpr+`
		 WHERE id = $8
		 RETURNING id, type_id, parent_id, name, code, description, status, priority,
		           progress, field_values, sort_order, depth, owner_id, assignee_id,
		           created_at, updated_at, created_by,
		           actual_start_date::text, actual_end_date::text`,
		req.Name, req.Code, req.Description, req.Status, req.Priority,
		req.FieldValues, req.AssigneeID, id,
	).Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code, &o.Description,
		&o.Status, &o.Priority, &o.Progress, &o.FieldValues,
		&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
		&o.CreatedAt, &o.UpdatedAt, &o.CreatedBy,
		&o.ActualStart, &o.ActualEnd)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed: "+err.Error())
		return
	}

	// Propagate progress & status up the hierarchy
	if o.ParentID != nil {
		h.propagateProgressUp(*o.ParentID)
	}

	writeJSON(w, http.StatusOK, o)
}

func (h *ObjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.canAccess(r, id, access.ActionDelete) {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	// Get parent_id before deleting (for progress recalc)
	var parentID *string
	h.db.QueryRow(context.Background(), `SELECT parent_id FROM objects WHERE id = $1`, id).Scan(&parentID)

	// Recursively delete object and all descendants
	_, err := h.db.Exec(context.Background(),
		`WITH RECURSIVE subtree AS (
			SELECT id FROM objects WHERE id = $1
			UNION ALL
			SELECT o.id FROM objects o INNER JOIN subtree s ON o.parent_id = s.id
		)
		DELETE FROM objects WHERE id IN (SELECT id FROM subtree)`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delete failed: "+err.Error())
		return
	}

	// Recalculate parent progress after deletion
	if parentID != nil {
		h.propagateProgressUp(*parentID)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ObjectHandler) GetDescendantsCount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var count int
	err := h.db.QueryRow(context.Background(),
		`WITH RECURSIVE subtree AS (
			SELECT id FROM objects WHERE parent_id = $1
			UNION ALL
			SELECT o.id FROM objects o INNER JOIN subtree s ON o.parent_id = s.id
		)
		SELECT COUNT(*) FROM subtree`, id).Scan(&count)
	if err != nil {
		count = 0
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

func (h *ObjectHandler) GetSubtree(w http.ResponseWriter, r *http.Request) {
	parentID := chi.URLParam(r, "id")

	// Light fields — no field_values, description, created_by
	rows, err := h.db.Query(context.Background(),
		`WITH RECURSIVE subtree AS (
			SELECT o.id, o.type_id, o.parent_id, o.name, o.code,
			       o.status, o.priority, o.progress,
			       o.sort_order, o.depth, o.owner_id, o.assignee_id,
			       o.created_at, o.updated_at,
			       o.actual_start_date, o.actual_end_date
			FROM objects o WHERE o.parent_id = $1
			UNION ALL
			SELECT o.id, o.type_id, o.parent_id, o.name, o.code,
			       o.status, o.priority, o.progress,
			       o.sort_order, o.depth, o.owner_id, o.assignee_id,
			       o.created_at, o.updated_at,
			       o.actual_start_date, o.actual_end_date
			FROM objects o INNER JOIN subtree s ON o.parent_id = s.id
		)
		SELECT s.id, s.type_id, s.parent_id, s.name, s.code,
		       s.status, s.priority, s.progress,
		       s.sort_order, s.depth, s.owner_id, s.assignee_id,
		       s.created_at, s.updated_at,
		       t.name, t.kind, t.color, t.icon,
		       s.actual_start_date::text, s.actual_end_date::text,
		       p.start_date::text, p.end_date::text, p.duration_days,
		       ua.first_name || ' ' || ua.last_name
		FROM subtree s
		JOIN object_types t ON t.id = s.type_id
		LEFT JOIN object_plans p ON p.object_id = s.id AND p.plan_type = 'operational'
		LEFT JOIN users ua ON ua.id = s.assignee_id
		ORDER BY s.sort_order, s.created_at`, parentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	all := map[string]*models.Object{}
	var roots []*models.Object
	var ordered []string

	for rows.Next() {
		var o models.Object
		if err := rows.Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code,
			&o.Status, &o.Priority, &o.Progress,
			&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
			&o.CreatedAt, &o.UpdatedAt,
			&o.TypeName, &o.TypeKind, &o.TypeColor, &o.TypeIcon,
			&o.ActualStart, &o.ActualEnd,
			&o.PlanStart, &o.PlanEnd, &o.PlanDuration,
			&o.AssigneeName); err != nil {
			continue
		}
		obj := o
		all[o.ID] = &obj
		ordered = append(ordered, o.ID)
	}

	for _, id := range ordered {
		o := all[id]
		if o.ParentID != nil && *o.ParentID == parentID {
			roots = append(roots, o)
		} else if o.ParentID != nil {
			if parent, ok := all[*o.ParentID]; ok {
				parent.Children = append(parent.Children, o)
			}
		}
	}

	if roots == nil {
		roots = []*models.Object{}
	}
	writeJSON(w, http.StatusOK, roots)
}

// GetAncestors returns the chain of parent objects from root to immediate parent.
func (h *ObjectHandler) GetAncestors(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rows, err := h.db.Query(context.Background(),
		`WITH RECURSIVE ancestors AS (
			SELECT id, parent_id, name, type_id FROM objects WHERE id = (SELECT parent_id FROM objects WHERE id = $1)
			UNION ALL
			SELECT o.id, o.parent_id, o.name, o.type_id
			FROM objects o INNER JOIN ancestors a ON o.id = a.parent_id
		)
		SELECT a.id, a.name FROM ancestors a
		ORDER BY (SELECT depth FROM objects WHERE id = a.id)`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type ancestor struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var result []ancestor
	for rows.Next() {
		var a ancestor
		if err := rows.Scan(&a.ID, &a.Name); err != nil {
			continue
		}
		result = append(result, a)
	}
	if result == nil {
		result = []ancestor{}
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *ObjectHandler) Move(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.MoveObjectRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Update parent and sort_order
	var depth int
	if req.ParentID != nil {
		h.db.QueryRow(context.Background(),
			`SELECT depth FROM objects WHERE id = $1`, *req.ParentID).Scan(&depth)
		depth++
	}

	var o models.Object
	err := h.db.QueryRow(context.Background(),
		`UPDATE objects SET
			parent_id = $1, sort_order = COALESCE($2, sort_order),
			depth = $3, updated_at = NOW()
		 WHERE id = $4
		 RETURNING id, type_id, parent_id, name, code, description, status, priority,
		           progress, field_values, sort_order, depth, owner_id, assignee_id,
		           created_at, updated_at, created_by,
		           actual_start_date::text, actual_end_date::text`,
		req.ParentID, req.SortOrder, depth, id,
	).Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code, &o.Description,
		&o.Status, &o.Priority, &o.Progress, &o.FieldValues,
		&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
		&o.CreatedAt, &o.UpdatedAt, &o.CreatedBy,
		&o.ActualStart, &o.ActualEnd)
	if err != nil {
		writeError(w, http.StatusNotFound, "object not found")
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (h *ObjectHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	for i, id := range req.IDs {
		h.db.Exec(context.Background(),
			`UPDATE objects SET sort_order = $1, updated_at = NOW() WHERE id = $2`, i, id)
	}
	w.WriteHeader(http.StatusNoContent)
}

// propagateProgressUp recalculates progress and status of a parent from its children.
// Uses weighted average by duration. Recurses up the tree.
// Cancelled children are excluded from calculation.
func (h *ObjectHandler) propagateProgressUp(parentID string) {
	// Calculate weighted progress from direct children
	var avgProgress float64
	var totalChildren, completedChildren, inProgressChildren int

	rows, err := h.db.Query(context.Background(),
		`SELECT o.status, o.progress, COALESCE(p.duration_days, 1) AS dur
		 FROM objects o
		 LEFT JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
		 WHERE o.parent_id = $1 AND o.status != 'cancelled'`, parentID)
	if err != nil {
		return
	}
	defer rows.Close()

	var totalWeight float64
	var weightedProgress float64
	for rows.Next() {
		var status string
		var progress, dur int
		rows.Scan(&status, &progress, &dur)
		totalChildren++
		w := float64(dur)
		if w < 1 {
			w = 1
		}
		totalWeight += w
		weightedProgress += w * float64(progress)
		if status == "completed" {
			completedChildren++
		}
		if status == "in_progress" || status == "on_hold" {
			inProgressChildren++
		}
	}

	if totalChildren == 0 {
		return
	}

	avgProgress = weightedProgress / totalWeight

	// Determine parent status
	newStatus := ""
	notStarted := totalChildren - completedChildren - inProgressChildren
	if completedChildren == totalChildren {
		newStatus = "completed"
		avgProgress = 100
	} else if inProgressChildren > 0 || completedChildren > 0 {
		newStatus = "in_progress"
	} else if notStarted == totalChildren {
		newStatus = "not_started"
		avgProgress = 0
	}

	// Update parent
	if newStatus != "" {
		h.db.Exec(context.Background(),
			`UPDATE objects SET
				progress = $1,
				status = $2::object_status,
				actual_start_date = CASE WHEN $2 = 'in_progress' THEN COALESCE(actual_start_date, CURRENT_DATE) ELSE actual_start_date END,
				actual_end_date = CASE WHEN $2 = 'completed' THEN COALESCE(actual_end_date, CURRENT_DATE) ELSE actual_end_date END,
				updated_at = NOW()
			 WHERE id = $3`, int(avgProgress), newStatus, parentID)
	} else {
		h.db.Exec(context.Background(),
			`UPDATE objects SET progress = $1, updated_at = NOW() WHERE id = $2`,
			int(avgProgress), parentID)
	}

	// Recurse up
	var grandParentID *string
	h.db.QueryRow(context.Background(),
		`SELECT parent_id FROM objects WHERE id = $1`, parentID).Scan(&grandParentID)
	if grandParentID != nil {
		h.propagateProgressUp(*grandParentID)
	}
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
