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

type WidgetCatalogHandler struct {
	db *pgxpool.Pool
}

func NewWidgetCatalogHandler(db *pgxpool.Pool) *WidgetCatalogHandler {
	return &WidgetCatalogHandler{db: db}
}

type catalogWidget struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  *string         `json:"description,omitempty"`
	Category     *string         `json:"category,omitempty"`
	PreviewImage *string         `json:"preview_image,omitempty"`
	Config       json.RawMessage `json:"config"`
	IsPublished  bool            `json:"is_published"`
	CreatedBy    *string         `json:"created_by,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	Installed    bool            `json:"installed,omitempty"`
}

// List returns published widgets (for all users) or all widgets (for superadmin)
func (h *WidgetCatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	isSuperAdmin := middleware.IsSuperAdmin(r.Context())

	var query string
	var args []interface{}
	if isSuperAdmin {
		query = `SELECT wc.id, wc.name, wc.description, wc.category, wc.preview_image,
		                wc.config, wc.is_published, wc.created_by, wc.created_at, wc.updated_at,
		                false AS installed
		         FROM widget_catalog wc
		         ORDER BY wc.created_at DESC`
	} else {
		query = `SELECT wc.id, wc.name, wc.description, wc.category, wc.preview_image,
		                wc.config, wc.is_published, wc.created_by, wc.created_at, wc.updated_at,
		                (wi.id IS NOT NULL) AS installed
		         FROM widget_catalog wc
		         LEFT JOIN widget_installations wi ON wi.catalog_widget_id = wc.id AND wi.workspace_id = $1
		         WHERE wc.is_published = true
		         ORDER BY wc.name`
		args = append(args, wsID)
	}

	rows, err := h.db.Query(context.Background(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var result []catalogWidget
	for rows.Next() {
		var cw catalogWidget
		if err := rows.Scan(&cw.ID, &cw.Name, &cw.Description, &cw.Category, &cw.PreviewImage,
			&cw.Config, &cw.IsPublished, &cw.CreatedBy, &cw.CreatedAt, &cw.UpdatedAt, &cw.Installed); err != nil {
			continue
		}
		result = append(result, cw)
	}
	if result == nil {
		result = []catalogWidget{}
	}
	writeJSON(w, http.StatusOK, result)
}

// Create — superadmin only
func (h *WidgetCatalogHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Name        string          `json:"name"`
		Description *string         `json:"description"`
		Category    *string         `json:"category"`
		Config      json.RawMessage `json:"config"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	var cw catalogWidget
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO widget_catalog (name, description, category, config, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, description, category, preview_image, config, is_published, created_by, created_at, updated_at`,
		req.Name, req.Description, req.Category, req.Config, userID,
	).Scan(&cw.ID, &cw.Name, &cw.Description, &cw.Category, &cw.PreviewImage,
		&cw.Config, &cw.IsPublished, &cw.CreatedBy, &cw.CreatedAt, &cw.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, cw)
}

// Update — superadmin only
func (h *WidgetCatalogHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Name         *string         `json:"name,omitempty"`
		Description  *string         `json:"description,omitempty"`
		Category     *string         `json:"category,omitempty"`
		Config       json.RawMessage `json:"config,omitempty"`
		PreviewImage *string         `json:"preview_image,omitempty"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	_, err := h.db.Exec(context.Background(),
		`UPDATE widget_catalog SET
			name = COALESCE($1, name),
			description = COALESCE($2, description),
			category = COALESCE($3, category),
			config = COALESCE($4, config),
			preview_image = COALESCE($5, preview_image),
			updated_at = NOW()
		 WHERE id = $6`,
		req.Name, req.Description, req.Category, req.Config, req.PreviewImage, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Delete — superadmin only
func (h *WidgetCatalogHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.db.Exec(context.Background(), `DELETE FROM widget_catalog WHERE id = $1`, id)
	w.WriteHeader(http.StatusNoContent)
}

// Publish — superadmin only
func (h *WidgetCatalogHandler) Publish(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.db.Exec(context.Background(),
		`UPDATE widget_catalog SET is_published = true, updated_at = NOW() WHERE id = $1`, id)
	w.WriteHeader(http.StatusNoContent)
}

// Install — any user installs a catalog widget to their workspace
func (h *WidgetCatalogHandler) Install(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())
	catalogID := chi.URLParam(r, "id")

	_, err := h.db.Exec(context.Background(),
		`INSERT INTO widget_installations (workspace_id, catalog_widget_id, installed_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, catalog_widget_id) DO NOTHING`,
		wsID, catalogID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "install failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Uninstall — remove widget from workspace
func (h *WidgetCatalogHandler) Uninstall(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	catalogID := chi.URLParam(r, "id")

	h.db.Exec(context.Background(),
		`DELETE FROM widget_installations WHERE workspace_id = $1 AND catalog_widget_id = $2`,
		wsID, catalogID)
	w.WriteHeader(http.StatusNoContent)
}
