package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type NoteLinkHandler struct {
	db *pgxpool.Pool
}

func NewNoteLinkHandler(db *pgxpool.Pool) *NoteLinkHandler {
	return &NoteLinkHandler{db: db}
}

type noteLinkResponse struct {
	ID       string    `json:"id"`
	SourceID string    `json:"source_id"`
	TargetID string    `json:"target_id"`
	LinkType string    `json:"link_type"`
	CreatedAt time.Time `json:"created_at"`
}

// List returns all note links in the workspace.
func (h *NoteLinkHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT id, source_id, target_id, link_type, created_at
		 FROM note_links
		 WHERE workspace_id = $1
		 ORDER BY created_at DESC`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var links []noteLinkResponse
	for rows.Next() {
		var l noteLinkResponse
		if err := rows.Scan(&l.ID, &l.SourceID, &l.TargetID, &l.LinkType, &l.CreatedAt); err != nil {
			continue
		}
		links = append(links, l)
	}
	if links == nil {
		links = []noteLinkResponse{}
	}
	writeJSONList(w, links, len(links))
}

// Create adds a new note link.
func (h *NoteLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	var req struct {
		SourceID string `json:"source_id"`
		TargetID string `json:"target_id"`
		LinkType string `json:"link_type"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SourceID == "" || req.TargetID == "" {
		writeError(w, http.StatusBadRequest, "source_id and target_id are required")
		return
	}
	if req.LinkType == "" {
		req.LinkType = "related"
	}

	var l noteLinkResponse
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO note_links (workspace_id, source_id, target_id, link_type)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, source_id, target_id, link_type, created_at`,
		wsID, req.SourceID, req.TargetID, req.LinkType,
	).Scan(&l.ID, &l.SourceID, &l.TargetID, &l.LinkType, &l.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create link failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// Delete removes a note link.
func (h *NoteLinkHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	tag, err := h.db.Exec(context.Background(),
		`DELETE FROM note_links WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delete failed: "+err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "link not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
