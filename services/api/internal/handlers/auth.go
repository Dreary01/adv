package handlers

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
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

// generateToken creates a JWT with workspace context
func (h *AuthHandler) generateToken(user models.User, ws *models.WorkspaceMembership) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"admin": user.IsAdmin,
		"sa":    user.IsSuperAdmin,
		"exp":   time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	if ws != nil {
		claims["ws"] = ws.WorkspaceID
		claims["wsr"] = ws.Role
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

// getUserWorkspaces returns all workspaces a user belongs to
func (h *AuthHandler) getUserWorkspaces(ctx context.Context, userID string) ([]models.WorkspaceMembership, error) {
	rows, err := h.db.Query(ctx,
		`SELECT wm.workspace_id, w.name, w.slug, wm.role, w.is_system
		 FROM workspace_members wm
		 JOIN workspaces w ON w.id = wm.workspace_id
		 WHERE wm.user_id = $1 AND w.is_active = true
		 ORDER BY w.is_system DESC, w.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.WorkspaceMembership
	for rows.Next() {
		var ws models.WorkspaceMembership
		if err := rows.Scan(&ws.WorkspaceID, &ws.Name, &ws.Slug, &ws.Role, &ws.IsSystem); err != nil {
			return nil, err
		}
		result = append(result, ws)
	}
	return result, nil
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
		`SELECT id, email, password_hash, first_name, last_name, is_active, is_admin, is_superadmin, created_at
		 FROM users WHERE email = $1`, req.Email,
	).Scan(&user.ID, &user.Email, &passwordHash, &user.FirstName, &user.LastName, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.CreatedAt)

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

	workspaces, err := h.getUserWorkspaces(context.Background(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load workspaces")
		return
	}

	var selectedWs *models.WorkspaceMembership
	if len(workspaces) == 1 {
		selectedWs = &workspaces[0]
	} else if len(workspaces) > 1 {
		// Auto-select first non-system workspace, or first one
		for i := range workspaces {
			if !workspaces[i].IsSystem {
				selectedWs = &workspaces[i]
				break
			}
		}
		if selectedWs == nil {
			selectedWs = &workspaces[0]
		}
	}

	tokenStr, err := h.generateToken(user, selectedWs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	resp := models.LoginResponse{
		Token:      tokenStr,
		User:       user,
		Workspace:  selectedWs,
		Workspaces: workspaces,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" || req.FirstName == "" {
		writeError(w, http.StatusBadRequest, "email, password, and first_name are required")
		return
	}

	if req.WorkspaceName == "" {
		req.WorkspaceName = req.FirstName + "'s Workspace"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	ctx := context.Background()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// 1. Create user
	var user models.User
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, first_name, last_name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, first_name, last_name, is_active, is_admin, is_superadmin, created_at`,
		req.Email, string(hash), req.FirstName, req.LastName,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.CreatedAt)

	if err != nil {
		writeError(w, http.StatusConflict, "email already exists")
		return
	}

	// 2. Create workspace
	slug := generateSlug(req.WorkspaceName)
	var wsID string
	err = tx.QueryRow(ctx,
		`INSERT INTO workspaces (name, slug, owner_id)
		 VALUES ($1, $2, $3)
		 RETURNING id`, req.WorkspaceName, slug, user.ID,
	).Scan(&wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create workspace")
		return
	}

	// 3. Add user as workspace admin
	_, err = tx.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role)
		 VALUES ($1, $2, 'admin')`, wsID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add workspace member")
		return
	}

	// 4. Seed default data for workspace
	if err := seedWorkspaceDefaults(ctx, tx, wsID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to seed workspace defaults")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit")
		return
	}

	ws := &models.WorkspaceMembership{
		WorkspaceID: wsID,
		Name:        req.WorkspaceName,
		Slug:        slug,
		Role:        "admin",
	}

	tokenStr, err := h.generateToken(user, ws)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusCreated, models.LoginResponse{
		Token:      tokenStr,
		User:       user,
		Workspace:  ws,
		Workspaces: []models.WorkspaceMembership{*ws},
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var user models.User
	err := h.db.QueryRow(context.Background(),
		`SELECT id, email, first_name, last_name, avatar_url, is_active, is_admin, is_superadmin, settings, created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.AvatarURL, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.Settings, &user.CreatedAt)

	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Also return workspace info from context
	wsID := middleware.GetWorkspaceID(r.Context())
	wsRole := middleware.GetWorkspaceRole(r.Context())

	type meResponse struct {
		models.User
		WorkspaceID   string `json:"workspace_id,omitempty"`
		WorkspaceRole string `json:"workspace_role,omitempty"`
	}

	writeJSON(w, http.StatusOK, meResponse{
		User:          user,
		WorkspaceID:   wsID,
		WorkspaceRole: wsRole,
	})
}

// PUT /api/auth/profile — update own profile
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		FirstName *string `json:"first_name"`
		LastName  *string `json:"last_name"`
		Email     *string `json:"email"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if req.FirstName != nil {
		h.db.Exec(context.Background(), `UPDATE users SET first_name = $1 WHERE id = $2`, *req.FirstName, userID)
	}
	if req.LastName != nil {
		h.db.Exec(context.Background(), `UPDATE users SET last_name = $1 WHERE id = $2`, *req.LastName, userID)
	}
	if req.Email != nil && *req.Email != "" {
		// Check uniqueness
		var exists bool
		h.db.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND id != $2)`, *req.Email, userID).Scan(&exists)
		if exists {
			writeError(w, http.StatusConflict, "email already taken")
			return
		}
		h.db.Exec(context.Background(), `UPDATE users SET email = $1 WHERE id = $2`, *req.Email, userID)
	}

	// Return updated user
	var user models.User
	h.db.QueryRow(context.Background(),
		`SELECT id, email, first_name, last_name, avatar_url, is_active, is_admin, is_superadmin, settings, created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.AvatarURL, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.Settings, &user.CreatedAt)

	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	workspaces, err := h.getUserWorkspaces(context.Background(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load workspaces")
		return
	}
	writeJSON(w, http.StatusOK, workspaces)
}

func (h *AuthHandler) SwitchWorkspace(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req models.SwitchWorkspaceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Verify user is a member of the target workspace
	var ws models.WorkspaceMembership
	err := h.db.QueryRow(context.Background(),
		`SELECT wm.workspace_id, w.name, w.slug, wm.role, w.is_system
		 FROM workspace_members wm
		 JOIN workspaces w ON w.id = wm.workspace_id
		 WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND w.is_active = true`,
		userID, req.WorkspaceID,
	).Scan(&ws.WorkspaceID, &ws.Name, &ws.Slug, &ws.Role, &ws.IsSystem)

	if err != nil {
		writeError(w, http.StatusForbidden, "not a member of this workspace")
		return
	}

	// Get user for token generation
	var user models.User
	err = h.db.QueryRow(context.Background(),
		`SELECT id, email, first_name, last_name, is_active, is_admin, is_superadmin, created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	tokenStr, err := h.generateToken(user, &ws)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusOK, models.LoginResponse{
		Token:     tokenStr,
		User:      user,
		Workspace: &ws,
	})
}

// generateSlug creates a URL-friendly slug from a name
func generateSlug(name string) string {
	slug := strings.ToLower(name)
	slug = regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(slug, "-")
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "workspace"
	}
	// Add timestamp suffix for uniqueness
	slug = fmt.Sprintf("%s-%d", slug, time.Now().UnixMilli()%100000)
	return slug
}
