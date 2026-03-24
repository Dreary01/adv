package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SettingsHandler struct {
	db *pgxpool.Pool
}

func NewSettingsHandler(db *pgxpool.Pool) *SettingsHandler {
	return &SettingsHandler{db: db}
}

// GET /api/admin/settings
func (h *SettingsHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT key, value FROM system_settings WHERE workspace_id = $1 ORDER BY key`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	settings := make(map[string]json.RawMessage)
	for rows.Next() {
		var key string
		var value json.RawMessage
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		settings[key] = value
	}
	writeJSON(w, http.StatusOK, settings)
}

// PUT /api/admin/settings
func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var req map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	for key, value := range req {
		_, err := h.db.Exec(context.Background(),
			`INSERT INTO system_settings (workspace_id, key, value, updated_at) VALUES ($1, $2, $3, NOW())
			 ON CONFLICT (workspace_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
			wsID, key, value)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	h.List(w, r)
}

// Modules — GET /api/modules
func (h *SettingsHandler) Modules(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	statuses := middleware.GetModuleStatuses(context.Background(), h.db, wsID)
	writeJSON(w, http.StatusOK, statuses)
}

// GET /api/admin/settings/{key}
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	key := r.URL.Query().Get("key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	var value json.RawMessage
	err := h.db.QueryRow(context.Background(),
		`SELECT value FROM system_settings WHERE workspace_id = $1 AND key = $2`, wsID, key).Scan(&value)
	if err != nil {
		writeError(w, http.StatusNotFound, "setting not found")
		return
	}
	writeJSON(w, http.StatusOK, value)
}
