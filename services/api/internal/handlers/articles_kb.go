package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ArticleHandler struct {
	db *pgxpool.Pool
}

func NewArticleHandler(db *pgxpool.Pool) *ArticleHandler {
	return &ArticleHandler{db: db}
}

type articleResponse struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Content     string          `json:"content"`
	ContentJSON json.RawMessage `json:"content_json,omitempty"`
	Category    string          `json:"category"`
	Tags        string          `json:"tags"`
	IsPublished bool            `json:"is_published"`
	CreatedBy   *string         `json:"created_by,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// List returns all articles for the workspace.
func (h *ArticleHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT id, title, content, content_json, category, tags, is_published,
		        created_by, created_at, updated_at
		 FROM articles
		 WHERE workspace_id = $1
		 ORDER BY updated_at DESC`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var articles []articleResponse
	for rows.Next() {
		var a articleResponse
		if err := rows.Scan(&a.ID, &a.Title, &a.Content, &a.ContentJSON,
			&a.Category, &a.Tags, &a.IsPublished,
			&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			continue
		}
		articles = append(articles, a)
	}
	if articles == nil {
		articles = []articleResponse{}
	}
	writeJSONList(w, articles, len(articles))
}

// Get returns a single article by ID.
func (h *ArticleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var a articleResponse
	err := h.db.QueryRow(context.Background(),
		`SELECT id, title, content, content_json, category, tags, is_published,
		        created_by, created_at, updated_at
		 FROM articles
		 WHERE id = $1 AND workspace_id = $2`, id, wsID,
	).Scan(&a.ID, &a.Title, &a.Content, &a.ContentJSON,
		&a.Category, &a.Tags, &a.IsPublished,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "article not found")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// Create adds a new article.
func (h *ArticleHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Title       string          `json:"title"`
		Content     string          `json:"content"`
		ContentJSON json.RawMessage `json:"content_json"`
		Category    string          `json:"category"`
		Tags        string          `json:"tags"`
		IsPublished *bool           `json:"is_published"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	var createdBy *string
	if userID != "" {
		createdBy = &userID
	}

	published := false
	if req.IsPublished != nil {
		published = *req.IsPublished
	}

	var a articleResponse
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO articles (workspace_id, title, content, content_json, category, tags, is_published, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, title, content, content_json, category, tags, is_published,
		           created_by, created_at, updated_at`,
		wsID, req.Title, req.Content, req.ContentJSON, req.Category, req.Tags, published, createdBy,
	).Scan(&a.ID, &a.Title, &a.Content, &a.ContentJSON,
		&a.Category, &a.Tags, &a.IsPublished,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create article failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

// Update modifies an existing article.
func (h *ArticleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var req struct {
		Title       string          `json:"title"`
		Content     string          `json:"content"`
		ContentJSON json.RawMessage `json:"content_json"`
		Category    string          `json:"category"`
		Tags        string          `json:"tags"`
		IsPublished *bool           `json:"is_published"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var a articleResponse
	err := h.db.QueryRow(context.Background(),
		`UPDATE articles SET
			title = COALESCE(NULLIF($1, ''), title),
			content = $2,
			content_json = $3,
			category = $4,
			tags = $5,
			is_published = COALESCE($6, is_published),
			updated_at = NOW()
		 WHERE id = $7 AND workspace_id = $8
		 RETURNING id, title, content, content_json, category, tags, is_published,
		           created_by, created_at, updated_at`,
		req.Title, req.Content, req.ContentJSON, req.Category, req.Tags,
		req.IsPublished, id, wsID,
	).Scan(&a.ID, &a.Title, &a.Content, &a.ContentJSON,
		&a.Category, &a.Tags, &a.IsPublished,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "article not found")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// Delete removes an article.
func (h *ArticleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	tag, err := h.db.Exec(context.Background(),
		`DELETE FROM articles WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delete failed: "+err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "article not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
