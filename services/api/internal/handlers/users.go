package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct {
	db *pgxpool.Pool
}

func NewUserHandler(db *pgxpool.Pool) *UserHandler {
	return &UserHandler{db: db}
}

// GET /api/users
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.is_active, u.is_admin, u.created_at
		 FROM users u
		 JOIN workspace_members wm ON wm.user_id = u.id
		 WHERE wm.workspace_id = $1
		 ORDER BY u.created_at`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.AvatarURL, &u.IsActive, &u.IsAdmin, &u.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		users = append(users, u)
	}
	if users == nil {
		users = []models.User{}
	}
	writeJSON(w, http.StatusOK, users)
}

// GET /api/users/{id}
func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var u models.User
	err := h.db.QueryRow(context.Background(),
		`SELECT id, email, first_name, last_name, avatar_url, is_active, is_admin, settings, created_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.AvatarURL, &u.IsActive, &u.IsAdmin, &u.Settings, &u.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// POST /api/users
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		Email     string `json:"email"`
		Password  string `json:"password"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		IsAdmin   bool   `json:"is_admin"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" || req.FirstName == "" {
		writeError(w, http.StatusBadRequest, "email, password, and first_name are required")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	tx, err := h.db.Begin(context.Background())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(context.Background())

	var u models.User
	err = tx.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, first_name, last_name, is_admin)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, email, first_name, last_name, is_active, is_admin, created_at`,
		req.Email, string(hash), req.FirstName, req.LastName, req.IsAdmin,
	).Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.IsActive, &u.IsAdmin, &u.CreatedAt)
	if err != nil {
		writeError(w, http.StatusConflict, "email already exists")
		return
	}

	// Add user to current workspace
	_, err = tx.Exec(context.Background(),
		`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
		wsID, u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(context.Background()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, u)
}

// PUT /api/users/{id}
func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Email     *string `json:"email"`
		FirstName *string `json:"first_name"`
		LastName  *string `json:"last_name"`
		IsActive  *bool   `json:"is_active"`
		IsAdmin   *bool   `json:"is_admin"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var u models.User
	err := h.db.QueryRow(context.Background(),
		`UPDATE users SET
			email = COALESCE($2, email),
			first_name = COALESCE($3, first_name),
			last_name = COALESCE($4, last_name),
			is_active = COALESCE($5, is_active),
			is_admin = COALESCE($6, is_admin),
			updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, email, first_name, last_name, avatar_url, is_active, is_admin, created_at`,
		id, req.Email, req.FirstName, req.LastName, req.IsActive, req.IsAdmin,
	).Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.AvatarURL, &u.IsActive, &u.IsAdmin, &u.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// DELETE /api/users/{id} — soft delete (deactivate)
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.db.Exec(context.Background(),
		`UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PUT /api/users/{id}/password
func (h *UserHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Password == "" {
		writeError(w, http.StatusBadRequest, "password is required")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	tag, err := h.db.Exec(context.Background(),
		`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, id, string(hash))
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
