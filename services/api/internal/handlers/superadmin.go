package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const globalSettingsWorkspaceID = "00000000-0000-0000-0000-000000000000"

type SuperAdminHandler struct {
	db *pgxpool.Pool
}

func NewSuperAdminHandler(db *pgxpool.Pool) *SuperAdminHandler {
	return &SuperAdminHandler{db: db}
}

func (h *SuperAdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	type stats struct {
		TotalWorkspaces   int `json:"total_workspaces"`
		ActiveWorkspaces  int `json:"active_workspaces"`
		TotalUsers        int `json:"total_users"`
		TotalObjects      int `json:"total_objects"`
		NewWorkspaces7d   int `json:"new_workspaces_7d"`
		NewUsers7d        int `json:"new_users_7d"`
	}
	var s stats
	h.db.QueryRow(context.Background(),
		`SELECT
			(SELECT COUNT(*) FROM workspaces WHERE NOT is_system),
			(SELECT COUNT(*) FROM workspaces WHERE is_active AND NOT is_system),
			(SELECT COUNT(*) FROM users WHERE is_active),
			(SELECT COUNT(*) FROM objects),
			(SELECT COUNT(*) FROM workspaces WHERE created_at > NOW() - INTERVAL '7 days' AND NOT is_system),
			(SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days')`).
		Scan(&s.TotalWorkspaces, &s.ActiveWorkspaces, &s.TotalUsers, &s.TotalObjects, &s.NewWorkspaces7d, &s.NewUsers7d)

	writeJSON(w, http.StatusOK, s)
}

func (h *SuperAdminHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(context.Background(),
		`SELECT w.id, w.name, w.slug, w.owner_id, w.is_system, w.is_active, w.created_at,
		        u.email AS owner_email,
		        (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count,
		        (SELECT COUNT(*) FROM objects o WHERE o.workspace_id = w.id) AS object_count,
		        (SELECT COUNT(*) FROM documents d WHERE d.workspace_id = w.id) AS doc_count,
		        (SELECT COALESCE(SUM(d.file_size), 0) FROM documents d WHERE d.workspace_id = w.id) AS doc_size_bytes
		 FROM workspaces w
		 JOIN users u ON u.id = w.owner_id
		 ORDER BY w.created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type wsRow struct {
		ID           string    `json:"id"`
		Name         string    `json:"name"`
		Slug         string    `json:"slug"`
		OwnerID      string    `json:"owner_id"`
		OwnerEmail   string    `json:"owner_email"`
		IsSystem     bool      `json:"is_system"`
		IsActive     bool      `json:"is_active"`
		MemberCount  int       `json:"member_count"`
		ObjectCount  int       `json:"object_count"`
		DocCount     int       `json:"doc_count"`
		DocSizeBytes int64     `json:"doc_size_bytes"`
		CreatedAt    time.Time `json:"created_at"`
	}
	var result []wsRow
	for rows.Next() {
		var ws wsRow
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.OwnerID, &ws.IsSystem, &ws.IsActive, &ws.CreatedAt,
			&ws.OwnerEmail, &ws.MemberCount, &ws.ObjectCount, &ws.DocCount, &ws.DocSizeBytes); err != nil {
			continue
		}
		result = append(result, ws)
	}
	if result == nil {
		result = []wsRow{}
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *SuperAdminHandler) UpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")

	var req struct {
		IsActive *bool   `json:"is_active,omitempty"`
		Name     *string `json:"name,omitempty"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if req.IsActive != nil {
		h.db.Exec(context.Background(),
			`UPDATE workspaces SET is_active = $1, updated_at = NOW() WHERE id = $2`,
			*req.IsActive, wsID)
	}
	if req.Name != nil {
		h.db.Exec(context.Background(),
			`UPDATE workspaces SET name = $1, updated_at = NOW() WHERE id = $2`,
			*req.Name, wsID)
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /api/superadmin/settings — global platform settings
func (h *SuperAdminHandler) GetGlobalSettings(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(context.Background(),
		`SELECT key, value FROM system_settings WHERE workspace_id = $1 ORDER BY key`, globalSettingsWorkspaceID)
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

// PUT /api/superadmin/settings — update global platform settings
func (h *SuperAdminHandler) UpdateGlobalSettings(w http.ResponseWriter, r *http.Request) {
	var req map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	for key, value := range req {
		_, err := h.db.Exec(context.Background(),
			`INSERT INTO system_settings (workspace_id, key, value, updated_at) VALUES ($1, $2, $3, NOW())
			 ON CONFLICT (workspace_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
			globalSettingsWorkspaceID, key, value)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	h.GetGlobalSettings(w, r)
}

func (h *SuperAdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(context.Background(),
		`SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.is_superadmin, u.created_at,
		        (SELECT COUNT(*) FROM workspace_members wm WHERE wm.user_id = u.id) AS workspace_count
		 FROM users u
		 ORDER BY u.created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type userRow struct {
		ID             string    `json:"id"`
		Email          string    `json:"email"`
		FirstName      string    `json:"first_name"`
		LastName       string    `json:"last_name"`
		IsActive       bool      `json:"is_active"`
		IsSuperAdmin   bool      `json:"is_superadmin"`
		WorkspaceCount int       `json:"workspace_count"`
		CreatedAt      time.Time `json:"created_at"`
	}
	var result []userRow
	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.IsActive, &u.IsSuperAdmin, &u.CreatedAt, &u.WorkspaceCount); err != nil {
			continue
		}
		result = append(result, u)
	}
	if result == nil {
		result = []userRow{}
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /api/superadmin/telegram/test — test bot token + proxy
func (h *SuperAdminHandler) TestTelegram(w http.ResponseWriter, r *http.Request) {
	settings := h.loadGlobalSettings("telegram.%")
	token := unquoteGlobal(settings["telegram.bot_token"])
	proxyURL := unquoteGlobal(settings["telegram.proxy_url"])

	if token == "" {
		writeError(w, http.StatusBadRequest, "Bot token not configured")
		return
	}

	username, err := telegramTestConnection(token, proxyURL)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Connection failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"bot_username": username})
}

// POST /api/superadmin/telegram/set-webhook
func (h *SuperAdminHandler) SetTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	settings := h.loadGlobalSettings("telegram.%")
	token := unquoteGlobal(settings["telegram.bot_token"])
	proxyURL := unquoteGlobal(settings["telegram.proxy_url"])

	if token == "" {
		writeError(w, http.StatusBadRequest, "Bot token not configured")
		return
	}

	var req struct {
		WebhookURL string `json:"webhook_url"`
	}
	decodeJSON(r, &req)
	if req.WebhookURL == "" {
		writeError(w, http.StatusBadRequest, "webhook_url required")
		return
	}

	if err := telegramSetWebhook(token, proxyURL, req.WebhookURL); err != nil {
		writeError(w, http.StatusBadGateway, "Webhook setup failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"webhook_url": req.WebhookURL, "status": "ok"})
}

func (h *SuperAdminHandler) loadGlobalSettings(pattern string) map[string]json.RawMessage {
	rows, err := h.db.Query(context.Background(),
		`SELECT key, value FROM system_settings WHERE workspace_id = $1 AND key LIKE $2`,
		globalSettingsWorkspaceID, pattern)
	if err != nil {
		return nil
	}
	defer rows.Close()
	result := map[string]json.RawMessage{}
	for rows.Next() {
		var key string
		var value json.RawMessage
		if rows.Scan(&key, &value) == nil {
			result[key] = value
		}
	}
	return result
}

func unquoteGlobal(raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return string(raw)
}
