package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ClassifierValueHandler struct {
	db *pgxpool.Pool
}

func NewClassifierValueHandler(db *pgxpool.Pool) *ClassifierValueHandler {
	return &ClassifierValueHandler{db: db}
}

// List returns all values for a requisite as a tree
func (h *ClassifierValueHandler) List(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "reqId")
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT id, requisite_id, parent_id, name, sort_order, is_locked, created_at
		 FROM classifier_values
		 WHERE requisite_id = $1 AND workspace_id = $2
		 ORDER BY sort_order, created_at`, reqID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	all := map[string]*models.ClassifierValue{}
	var roots []*models.ClassifierValue
	var ordered []string

	for rows.Next() {
		var v models.ClassifierValue
		if err := rows.Scan(&v.ID, &v.RequisiteID, &v.ParentID, &v.Name, &v.SortOrder, &v.IsLocked, &v.CreatedAt); err != nil {
			continue
		}
		cv := v
		all[v.ID] = &cv
		ordered = append(ordered, v.ID)
	}

	for _, id := range ordered {
		v := all[id]
		if v.ParentID == nil {
			roots = append(roots, v)
		} else if parent, ok := all[*v.ParentID]; ok {
			parent.Children = append(parent.Children, v)
		}
	}

	if roots == nil {
		roots = []*models.ClassifierValue{}
	}
	writeJSON(w, http.StatusOK, roots)
}

// Create adds a new classifier value
func (h *ClassifierValueHandler) Create(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "reqId")
	wsID := middleware.GetWorkspaceID(r.Context())

	var req struct {
		Name     string  `json:"name"`
		ParentID *string `json:"parent_id"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	// Get max sort_order
	var maxOrder int
	h.db.QueryRow(context.Background(),
		`SELECT COALESCE(MAX(sort_order), -1) FROM classifier_values WHERE requisite_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND workspace_id = $3`,
		reqID, req.ParentID, wsID).Scan(&maxOrder)

	var v models.ClassifierValue
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO classifier_values (workspace_id, requisite_id, parent_id, name, sort_order)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, requisite_id, parent_id, name, sort_order, is_locked, created_at`,
		wsID, reqID, req.ParentID, req.Name, maxOrder+1,
	).Scan(&v.ID, &v.RequisiteID, &v.ParentID, &v.Name, &v.SortOrder, &v.IsLocked, &v.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

// Update renames or moves a classifier value
func (h *ClassifierValueHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "valueId")
	wsID := middleware.GetWorkspaceID(r.Context())

	var req struct {
		Name     *string `json:"name"`
		ParentID *string `json:"parent_id"`
		IsLocked *bool   `json:"is_locked"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	var v models.ClassifierValue
	err := h.db.QueryRow(context.Background(),
		`UPDATE classifier_values SET
			name = COALESCE($1, name),
			parent_id = COALESCE($2, parent_id),
			is_locked = COALESCE($3, is_locked)
		 WHERE id = $4 AND workspace_id = $5
		 RETURNING id, requisite_id, parent_id, name, sort_order, is_locked, created_at`,
		req.Name, req.ParentID, req.IsLocked, id, wsID,
	).Scan(&v.ID, &v.RequisiteID, &v.ParentID, &v.Name, &v.SortOrder, &v.IsLocked, &v.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// Delete removes a classifier value
func (h *ClassifierValueHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "valueId")
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(), `DELETE FROM classifier_values WHERE id = $1 AND workspace_id = $2`, id, wsID)
	w.WriteHeader(http.StatusNoContent)
}

// Reorder sets sort_order for a list of values
func (h *ClassifierValueHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	for i, id := range req.IDs {
		h.db.Exec(context.Background(),
			`UPDATE classifier_values SET sort_order = $1 WHERE id = $2 AND workspace_id = $3`, i, id, wsID)
	}
	w.WriteHeader(http.StatusNoContent)
}
