package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/search"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GlobalSearchHandler struct {
	db *pgxpool.Pool
}

func NewGlobalSearchHandler(db *pgxpool.Pool) *GlobalSearchHandler {
	return &GlobalSearchHandler{db: db}
}

type searchResultItem struct {
	Type    string  `json:"type"`
	ID      string  `json:"id"`
	Title   string  `json:"title"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
	Source  string  `json:"source"`
}

// Search performs a hybrid (semantic + keyword) search across the workspace.
func (h *GlobalSearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	var req struct {
		Query string `json:"query"`
		TopK  int    `json:"top_k"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "query is required")
		return
	}
	if req.TopK <= 0 {
		req.TopK = 20
	}

	results := search.HybridSearch(context.Background(), h.db, wsID, req.Query, req.TopK)

	var items []searchResultItem
	for _, sr := range results {
		items = append(items, searchResultItem{
			Type:    sr.Type,
			ID:      sr.ID,
			Title:   sr.Title,
			Snippet: sr.Snippet,
			Score:   sr.Score,
			Source:  sr.Source,
		})
	}
	if items == nil {
		items = []searchResultItem{}
	}

	writeJSON(w, http.StatusOK, items)
}
