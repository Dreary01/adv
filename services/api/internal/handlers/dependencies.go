package handlers

import (
	"context"
	"net/http"

	"github.com/adv/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DependencyHandler struct {
	db *pgxpool.Pool
}

func NewDependencyHandler(db *pgxpool.Pool) *DependencyHandler {
	return &DependencyHandler{db: db}
}

// List returns all dependencies for an object and its entire subtree
func (h *DependencyHandler) List(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")

	rows, err := h.db.Query(context.Background(),
		`WITH RECURSIVE subtree AS (
			SELECT id FROM objects WHERE id = $1
			UNION ALL
			SELECT o.id FROM objects o JOIN subtree s ON o.parent_id = s.id
		)
		SELECT d.id, d.predecessor_id, d.successor_id, d.type, d.lag_days
		FROM dependencies d
		WHERE d.predecessor_id IN (SELECT id FROM subtree)
		   OR d.successor_id IN (SELECT id FROM subtree)`, objectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var deps []models.Dependency
	for rows.Next() {
		var d models.Dependency
		if err := rows.Scan(&d.ID, &d.PredecessorID, &d.SuccessorID, &d.Type, &d.LagDays); err != nil {
			continue
		}
		deps = append(deps, d)
	}
	if deps == nil {
		deps = []models.Dependency{}
	}
	writeJSON(w, http.StatusOK, deps)
}

// Create adds a new dependency
func (h *DependencyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PredecessorID string `json:"predecessor_id"`
		SuccessorID   string `json:"successor_id"`
		Type          string `json:"type"`
		LagDays       int    `json:"lag_days"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.PredecessorID == "" || req.SuccessorID == "" {
		writeError(w, http.StatusBadRequest, "predecessor_id and successor_id required")
		return
	}
	if req.Type == "" {
		req.Type = "fs"
	}

	var d models.Dependency
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO dependencies (predecessor_id, successor_id, type, lag_days)
		 VALUES ($1, $2, $3::dependency_type, $4)
		 ON CONFLICT (predecessor_id, successor_id) DO UPDATE SET type = EXCLUDED.type, lag_days = EXCLUDED.lag_days
		 RETURNING id, predecessor_id, successor_id, type, lag_days`,
		req.PredecessorID, req.SuccessorID, req.Type, req.LagDays,
	).Scan(&d.ID, &d.PredecessorID, &d.SuccessorID, &d.Type, &d.LagDays)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create dependency failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

// Delete removes a dependency
func (h *DependencyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	depID := chi.URLParam(r, "depId")
	h.db.Exec(context.Background(), `DELETE FROM dependencies WHERE id = $1`, depID)
	w.WriteHeader(http.StatusNoContent)
}
