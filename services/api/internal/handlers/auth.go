package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/adv/api/internal/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db        *pgxpool.Pool
	jwtSecret string
}

func NewAuthHandler(db *pgxpool.Pool, jwtSecret string) *AuthHandler {
	return &AuthHandler{db: db, jwtSecret: jwtSecret}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var user models.User
	var passwordHash string
	err := h.db.QueryRow(context.Background(),
		`SELECT id, email, password_hash, first_name, last_name, is_active, is_admin, created_at
		 FROM users WHERE email = $1`, req.Email,
	).Scan(&user.ID, &user.Email, &passwordHash, &user.FirstName, &user.LastName, &user.IsActive, &user.IsAdmin, &user.CreatedAt)

	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if !user.IsActive {
		writeError(w, http.StatusForbidden, "account is disabled")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"admin": user.IsAdmin,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenStr, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusOK, models.LoginResponse{Token: tokenStr, User: user})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email     string `json:"email"`
		Password  string `json:"password"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	var user models.User
	err = h.db.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, first_name, last_name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, first_name, last_name, is_active, is_admin, created_at`,
		req.Email, string(hash), req.FirstName, req.LastName,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.IsActive, &user.IsAdmin, &user.CreatedAt)

	if err != nil {
		writeError(w, http.StatusConflict, "email already exists")
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("user_id")
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var user models.User
	err := h.db.QueryRow(context.Background(),
		`SELECT id, email, first_name, last_name, avatar_url, is_active, is_admin, settings, created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.AvatarURL, &user.IsActive, &user.IsAdmin, &user.Settings, &user.CreatedAt)

	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, user)
}
