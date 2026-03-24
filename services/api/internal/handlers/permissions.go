package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/custle/api/internal/access"
	"github.com/custle/api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PermissionHandler struct {
	db        *pgxpool.Pool
	accessSvc *access.Service
}

func NewPermissionHandler(db *pgxpool.Pool, accessSvc *access.Service) *PermissionHandler {
	return &PermissionHandler{db: db, accessSvc: accessSvc}
}

type permissionRow struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	ResourceType string    `json:"resource_type"`
	ResourceID   string    `json:"resource_id"`
	Actions      int       `json:"actions"`
	Recursive    bool      `json:"recursive"`
	GrantedBy    *string   `json:"granted_by,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	// Joined fields for display
	ResourceName *string `json:"resource_name,omitempty"`
	UserName     *string `json:"user_name,omitempty"`
}

// GET /api/permissions?user_id=X or ?resource_type=T&resource_id=R
func (h *PermissionHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := r.URL.Query().Get("user_id")
	resType := r.URL.Query().Get("resource_type")
	resID := r.URL.Query().Get("resource_id")

	var rows_result []permissionRow

	if userID != "" {
		rows, err := h.db.Query(context.Background(),
			`SELECT p.id, p.user_id, p.resource_type, p.resource_id, p.actions, p.recursive, p.granted_by, p.created_at,
			        CASE
			          WHEN p.resource_type = 'object' THEN (SELECT name FROM objects WHERE id = p.resource_id AND workspace_id = $2)
			          WHEN p.resource_type = 'ref_table' THEN (SELECT name FROM reference_tables WHERE id = p.resource_id AND workspace_id = $2)
			        END AS resource_name
			 FROM permissions p
			 WHERE p.user_id = $1 AND p.workspace_id = $2
			 ORDER BY p.resource_type, p.created_at`, userID, wsID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		for rows.Next() {
			var p permissionRow
			if err := rows.Scan(&p.ID, &p.UserID, &p.ResourceType, &p.ResourceID, &p.Actions, &p.Recursive, &p.GrantedBy, &p.CreatedAt, &p.ResourceName); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			rows_result = append(rows_result, p)
		}
	} else if resType != "" && resID != "" {
		rows, err := h.db.Query(context.Background(),
			`SELECT p.id, p.user_id, p.resource_type, p.resource_id, p.actions, p.recursive, p.granted_by, p.created_at,
			        u.first_name || ' ' || u.last_name AS user_name
			 FROM permissions p
			 JOIN users u ON u.id = p.user_id
			 WHERE p.resource_type = $1 AND p.resource_id = $2 AND p.workspace_id = $3
			 ORDER BY p.created_at`, resType, resID, wsID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		for rows.Next() {
			var p permissionRow
			if err := rows.Scan(&p.ID, &p.UserID, &p.ResourceType, &p.ResourceID, &p.Actions, &p.Recursive, &p.GrantedBy, &p.CreatedAt, &p.UserName); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			rows_result = append(rows_result, p)
		}
	} else {
		writeError(w, http.StatusBadRequest, "user_id or (resource_type + resource_id) required")
		return
	}

	if rows_result == nil {
		rows_result = []permissionRow{}
	}
	writeJSON(w, http.StatusOK, rows_result)
}

// POST /api/permissions
func (h *PermissionHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	grantedBy := middleware.GetUserID(r.Context())

	var req struct {
		UserID       string `json:"user_id"`
		ResourceType string `json:"resource_type"`
		ResourceID   string `json:"resource_id"`
		Actions      int    `json:"actions"`
		Recursive    bool   `json:"recursive"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID == "" || req.ResourceType == "" || req.ResourceID == "" {
		writeError(w, http.StatusBadRequest, "user_id, resource_type, and resource_id are required")
		return
	}
	if req.Actions < 1 || req.Actions > 15 {
		writeError(w, http.StatusBadRequest, "actions must be between 1 and 15")
		return
	}

	var p permissionRow
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO permissions (workspace_id, user_id, resource_type, resource_id, actions, recursive, granted_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (user_id, resource_type, resource_id)
		 DO UPDATE SET actions = $5, recursive = $6, granted_by = $7
		 RETURNING id, user_id, resource_type, resource_id, actions, recursive, granted_by, created_at`,
		wsID, req.UserID, req.ResourceType, req.ResourceID, req.Actions, req.Recursive, grantedBy,
	).Scan(&p.ID, &p.UserID, &p.ResourceType, &p.ResourceID, &p.Actions, &p.Recursive, &p.GrantedBy, &p.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.accessSvc.InvalidateUser(req.UserID)
	writeJSON(w, http.StatusCreated, p)
}

// PUT /api/permissions/{id}
func (h *PermissionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		Actions   *int  `json:"actions"`
		Recursive *bool `json:"recursive"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var p permissionRow
	err := h.db.QueryRow(context.Background(),
		`UPDATE permissions SET
			actions = COALESCE($2, actions),
			recursive = COALESCE($3, recursive)
		 WHERE id = $1 AND workspace_id = $4
		 RETURNING id, user_id, resource_type, resource_id, actions, recursive, granted_by, created_at`,
		id, req.Actions, req.Recursive, wsID,
	).Scan(&p.ID, &p.UserID, &p.ResourceType, &p.ResourceID, &p.Actions, &p.Recursive, &p.GrantedBy, &p.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "permission not found")
		return
	}

	h.accessSvc.InvalidateUser(p.UserID)
	writeJSON(w, http.StatusOK, p)
}

// DELETE /api/permissions/{id}
func (h *PermissionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var userID string
	err := h.db.QueryRow(context.Background(),
		`DELETE FROM permissions WHERE id = $1 AND workspace_id = $2 RETURNING user_id`, id, wsID).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "permission not found")
		return
	}

	h.accessSvc.InvalidateUser(userID)
	w.WriteHeader(http.StatusNoContent)
}
