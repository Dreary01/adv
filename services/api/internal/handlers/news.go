package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

type NewsHandler struct {
	db *pgxpool.Pool
}

func NewNewsHandler(db *pgxpool.Pool) *NewsHandler {
	return &NewsHandler{db: db}
}

func (h *NewsHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT n.id, n.title, n.body, n.is_published, n.created_at, n.created_by,
		        u.first_name || ' ' || u.last_name
		 FROM news n
		 LEFT JOIN users u ON u.id = n.created_by
		 WHERE n.is_published = true AND n.workspace_id = $1
		 ORDER BY n.created_at DESC
		 LIMIT 20`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var news []models.News
	for rows.Next() {
		var n models.News
		if err := rows.Scan(&n.ID, &n.Title, &n.Body, &n.IsPublished, &n.CreatedAt, &n.CreatedBy, &n.AuthorName); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		news = append(news, n)
	}
	if news == nil {
		news = []models.News{}
	}
	writeJSONList(w, news, len(news))
}

func (h *NewsHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req models.CreateNewsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	var n models.News
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO news (workspace_id, title, body, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, title, body, is_published, created_at, created_by`,
		wsID, req.Title, req.Body, userID,
	).Scan(&n.ID, &n.Title, &n.Body, &n.IsPublished, &n.CreatedAt, &n.CreatedBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, n)
}
