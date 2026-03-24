package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ParticipantHandler struct {
	db *pgxpool.Pool
}

func NewParticipantHandler(db *pgxpool.Pool) *ParticipantHandler {
	return &ParticipantHandler{db: db}
}

type participantRow struct {
	ObjectID  string    `json:"object_id"`
	UserID    string    `json:"user_id"`
	Role      string    `json:"role"`
	UserName  string    `json:"user_name"`
	UserEmail string    `json:"user_email"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}

// GET /api/objects/{id}/participants
func (h *ParticipantHandler) List(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT op.object_id, op.user_id, op.role,
		        u.first_name || ' ' || u.last_name AS user_name, u.email, u.avatar_url
		 FROM object_participants op
		 JOIN users u ON u.id = op.user_id
		 WHERE op.object_id = $1 AND op.workspace_id = $2
		 ORDER BY op.role, u.first_name`, objectID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var participants []participantRow
	for rows.Next() {
		var p participantRow
		if err := rows.Scan(&p.ObjectID, &p.UserID, &p.Role, &p.UserName, &p.UserEmail, &p.AvatarURL); err != nil {
			continue
		}
		participants = append(participants, p)
	}
	if participants == nil {
		participants = []participantRow{}
	}
	writeJSON(w, http.StatusOK, participants)
}

// POST /api/objects/{id}/participants
func (h *ParticipantHandler) Add(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.UserID == "" || req.Role == "" {
		writeError(w, http.StatusBadRequest, "user_id and role are required")
		return
	}

	_, err := h.db.Exec(context.Background(),
		`INSERT INTO object_participants (workspace_id, object_id, user_id, role)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (object_id, user_id) DO UPDATE SET role = $4`,
		wsID, objectID, req.UserID, req.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// PUT /api/objects/{id}/participants/{userId}
func (h *ParticipantHandler) Update(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Role == "" {
		writeError(w, http.StatusBadRequest, "role is required")
		return
	}

	tag, err := h.db.Exec(context.Background(),
		`UPDATE object_participants SET role = $4 WHERE object_id = $1 AND user_id = $2 AND workspace_id = $3`,
		objectID, userID, wsID, req.Role)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "participant not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/objects/{id}/participants/{userId}
func (h *ParticipantHandler) Delete(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(),
		`DELETE FROM object_participants WHERE object_id = $1 AND user_id = $2 AND workspace_id = $3`,
		objectID, userID, wsID)
	w.WriteHeader(http.StatusNoContent)
}

// IsManager checks if user has manager role on the given object.
// Exported for use by other handlers (plans).
func IsManager(db *pgxpool.Pool, ctx context.Context, objectID, userID string) bool {
	wsID := middleware.GetWorkspaceID(ctx)
	var role string
	err := db.QueryRow(ctx,
		`SELECT role FROM object_participants WHERE object_id = $1 AND user_id = $2 AND workspace_id = $3`,
		objectID, userID, wsID).Scan(&role)
	return err == nil && role == "manager"
}
