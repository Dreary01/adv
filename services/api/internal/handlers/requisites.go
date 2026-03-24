package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RequisiteHandler struct {
	db *pgxpool.Pool
}

func NewRequisiteHandler(db *pgxpool.Pool) *RequisiteHandler {
	return &RequisiteHandler{db: db}
}

func (h *RequisiteHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT r.id, r.name, r.description, r.type, r.group_id, g.name, r.config, r.is_unique, r.created_at
		 FROM requisites r
		 LEFT JOIN requisite_groups g ON g.id = r.group_id
		 WHERE r.workspace_id = $1
		 ORDER BY r.name`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var reqs []models.Requisite
	for rows.Next() {
		var req models.Requisite
		if err := rows.Scan(&req.ID, &req.Name, &req.Description, &req.Type,
			&req.GroupID, &req.GroupName, &req.Config, &req.IsUnique, &req.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		reqs = append(reqs, req)
	}
	if reqs == nil {
		reqs = []models.Requisite{}
	}
	writeJSONList(w, reqs, len(reqs))
}

func (h *RequisiteHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	var req models.Requisite
	err := h.db.QueryRow(context.Background(),
		`SELECT r.id, r.name, r.description, r.type, r.group_id, g.name, r.config, r.is_unique, r.created_at
		 FROM requisites r LEFT JOIN requisite_groups g ON g.id = r.group_id
		 WHERE r.id = $1 AND r.workspace_id = $2`, id, wsID,
	).Scan(&req.ID, &req.Name, &req.Description, &req.Type,
		&req.GroupID, &req.GroupName, &req.Config, &req.IsUnique, &req.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "requisite not found")
		return
	}
	writeJSON(w, http.StatusOK, req)
}

func (h *RequisiteHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var input models.CreateRequisiteRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if input.Name == "" || input.Type == "" {
		writeError(w, http.StatusBadRequest, "name and type are required")
		return
	}
	if input.Config == nil {
		input.Config = []byte("{}")
	}

	var req models.Requisite
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO requisites (workspace_id, name, description, type, group_id, config, is_unique)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, name, description, type, group_id, config, is_unique, created_at`,
		wsID, input.Name, input.Description, input.Type, input.GroupID, input.Config, input.IsUnique,
	).Scan(&req.ID, &req.Name, &req.Description, &req.Type, &req.GroupID, &req.Config, &req.IsUnique, &req.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, req)
}

func (h *RequisiteHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	var input models.CreateRequisiteRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if input.Config == nil {
		input.Config = []byte("{}")
	}

	var req models.Requisite
	err := h.db.QueryRow(context.Background(),
		`UPDATE requisites SET
			name = COALESCE(NULLIF($1, ''), name),
			description = $2, type = COALESCE(NULLIF($3::text, '')::requisite_type, type),
			group_id = $4, config = $5, is_unique = $6, updated_at = NOW()
		 WHERE id = $7 AND workspace_id = $8
		 RETURNING id, name, description, type, group_id, config, is_unique, created_at`,
		input.Name, input.Description, input.Type, input.GroupID, input.Config, input.IsUnique, id, wsID,
	).Scan(&req.ID, &req.Name, &req.Description, &req.Type, &req.GroupID, &req.Config, &req.IsUnique, &req.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update requisite failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, req)
}

func (h *RequisiteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(), `DELETE FROM requisites WHERE id = $1 AND workspace_id = $2`, id, wsID)
	w.WriteHeader(http.StatusNoContent)
}

// Groups

func (h *RequisiteHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT id, name, sort_order FROM requisite_groups WHERE workspace_id = $1 ORDER BY sort_order, name`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type Group struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	var groups []Group
	for rows.Next() {
		var g Group
		rows.Scan(&g.ID, &g.Name, &g.SortOrder)
		groups = append(groups, g)
	}
	if groups == nil {
		groups = []Group{}
	}
	writeJSONList(w, groups, len(groups))
}

func (h *RequisiteHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var input struct {
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	if err := decodeJSON(r, &input); err != nil || input.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id string
	h.db.QueryRow(context.Background(),
		`INSERT INTO requisite_groups (workspace_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
		wsID, input.Name, input.SortOrder).Scan(&id)
	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "name": input.Name})
}
