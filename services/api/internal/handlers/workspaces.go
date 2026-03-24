package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WorkspaceHandler struct {
	db *pgxpool.Pool
}

func NewWorkspaceHandler(db *pgxpool.Pool) *WorkspaceHandler {
	return &WorkspaceHandler{db: db}
}

func (h *WorkspaceHandler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	var ws struct {
		ID        string    `json:"id"`
		Name      string    `json:"name"`
		Slug      string    `json:"slug"`
		OwnerID   string    `json:"owner_id"`
		IsSystem  bool      `json:"is_system"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
	}
	err := h.db.QueryRow(context.Background(),
		`SELECT id, name, slug, owner_id, is_system, is_active, created_at
		 FROM workspaces WHERE id = $1`, wsID,
	).Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.OwnerID, &ws.IsSystem, &ws.IsActive, &ws.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (h *WorkspaceHandler) UpdateCurrent(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	_, err := h.db.Exec(context.Background(),
		`UPDATE workspaces SET name = $1, updated_at = NOW() WHERE id = $2`,
		req.Name, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WorkspaceHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.is_active, wm.role, wm.joined_at
		 FROM workspace_members wm
		 JOIN users u ON u.id = wm.user_id
		 WHERE wm.workspace_id = $1
		 ORDER BY wm.joined_at`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type member struct {
		ID        string    `json:"id"`
		Email     string    `json:"email"`
		FirstName string    `json:"first_name"`
		LastName  string    `json:"last_name"`
		AvatarURL *string   `json:"avatar_url,omitempty"`
		IsActive  bool      `json:"is_active"`
		Role      string    `json:"role"`
		JoinedAt  time.Time `json:"joined_at"`
	}
	var members []member
	for rows.Next() {
		var m member
		if err := rows.Scan(&m.ID, &m.Email, &m.FirstName, &m.LastName, &m.AvatarURL, &m.IsActive, &m.Role, &m.JoinedAt); err != nil {
			continue
		}
		members = append(members, m)
	}
	if members == nil {
		members = []member{}
	}
	writeJSON(w, http.StatusOK, members)
}

func (h *WorkspaceHandler) InviteMember(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Role == "" {
		req.Role = "member"
	}

	token := generateInviteToken()
	_, err := h.db.Exec(context.Background(),
		`INSERT INTO workspace_invitations (workspace_id, email, role, token, invited_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
		wsID, req.Email, req.Role, token, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create invitation")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"token": token})
}

func (h *WorkspaceHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	userID := middleware.GetUserID(r.Context())

	var wsID, role string
	err := h.db.QueryRow(context.Background(),
		`SELECT workspace_id, role FROM workspace_invitations
		 WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`, req.Token,
	).Scan(&wsID, &role)
	if err != nil {
		writeError(w, http.StatusNotFound, "invitation not found or expired")
		return
	}

	ctx := context.Background()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO NOTHING`, wsID, userID, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	_, err = tx.Exec(ctx,
		`UPDATE workspace_invitations SET accepted_at = NOW() WHERE token = $1`, req.Token)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark invitation")
		return
	}

	tx.Commit(ctx)
	writeJSON(w, http.StatusOK, map[string]string{"workspace_id": wsID})
}

func (h *WorkspaceHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	memberID := chi.URLParam(r, "userId")

	// Prevent removing the workspace owner
	var ownerID string
	h.db.QueryRow(context.Background(),
		`SELECT owner_id FROM workspaces WHERE id = $1`, wsID).Scan(&ownerID)
	if memberID == ownerID {
		writeError(w, http.StatusForbidden, "cannot remove workspace owner")
		return
	}

	_, err := h.db.Exec(context.Background(),
		`DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`, wsID, memberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WorkspaceHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	memberID := chi.URLParam(r, "userId")

	var req struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	_, err := h.db.Exec(context.Background(),
		`UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
		req.Role, wsID, memberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update role")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func generateInviteToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
