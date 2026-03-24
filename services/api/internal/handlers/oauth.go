package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/custle/api/internal/config"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OAuthHandler struct {
	db  *pgxpool.Pool
	cfg *config.Config
}

func NewOAuthHandler(db *pgxpool.Pool, cfg *config.Config) *OAuthHandler {
	return &OAuthHandler{db: db, cfg: cfg}
}

// Provider configuration
type oauthProvider struct {
	AuthURL    string
	TokenURL   string
	ProfileURL string
	Scopes     string
	ClientID   string
	Secret     string
}

func (h *OAuthHandler) getProvider(name string) *oauthProvider {
	switch name {
	case "vk":
		return &oauthProvider{
			AuthURL:    "https://oauth.vk.com/authorize",
			TokenURL:   "https://oauth.vk.com/access_token",
			ProfileURL: "https://api.vk.com/method/users.get?fields=photo_200,screen_name&v=5.199",
			Scopes:     "email",
			ClientID:   h.cfg.VKClientID,
			Secret:     h.cfg.VKClientSecret,
		}
	case "yandex":
		return &oauthProvider{
			AuthURL:    "https://oauth.yandex.ru/authorize",
			TokenURL:   "https://oauth.yandex.ru/token",
			ProfileURL: "https://login.yandex.ru/info?format=json",
			Scopes:     "login:email login:info",
			ClientID:   h.cfg.YandexClientID,
			Secret:     h.cfg.YandexClientSecret,
		}
	case "google":
		return &oauthProvider{
			AuthURL:    "https://accounts.google.com/o/oauth2/v2/auth",
			TokenURL:   "https://oauth2.googleapis.com/token",
			ProfileURL: "https://www.googleapis.com/oauth2/v2/userinfo",
			Scopes:     "email profile",
			ClientID:   h.cfg.GoogleClientID,
			Secret:     h.cfg.GoogleClientSecret,
		}
	}
	return nil
}

func (h *OAuthHandler) callbackURL(provider string) string {
	return fmt.Sprintf("%s/api/auth/oauth/%s/callback", h.cfg.OAuthRedirectBase, provider)
}

// ─── State token (CSRF protection without sessions) ─────

func (h *OAuthHandler) generateState() string {
	b := make([]byte, 16)
	rand.Read(b)
	random := base64.RawURLEncoding.EncodeToString(b)
	mac := hmac.New(sha256.New, []byte(h.cfg.JWTSecret))
	mac.Write([]byte(random))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return random + "." + sig
}

func (h *OAuthHandler) validateState(state string) bool {
	parts := strings.SplitN(state, ".", 2)
	if len(parts) != 2 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(h.cfg.JWTSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(parts[1]), []byte(expected))
}

// ─── Redirect to provider ───────────────────────────────

func (h *OAuthHandler) Redirect(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")
	provider := h.getProvider(providerName)
	if provider == nil || provider.ClientID == "" {
		http.Error(w, "unknown or unconfigured provider", http.StatusBadRequest)
		return
	}

	state := h.generateState()
	params := url.Values{
		"client_id":     {provider.ClientID},
		"redirect_uri":  {h.callbackURL(providerName)},
		"response_type": {"code"},
		"scope":         {provider.Scopes},
		"state":         {state},
	}

	http.Redirect(w, r, provider.AuthURL+"?"+params.Encode(), http.StatusFound)
}

// ─── Callback from provider ─────────────────────────────

func (h *OAuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "provider")
	provider := h.getProvider(providerName)
	if provider == nil {
		h.oauthError(w, r, "unknown provider")
		return
	}

	// Validate state
	state := r.URL.Query().Get("state")
	if !h.validateState(state) {
		h.oauthError(w, r, "invalid state")
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		h.oauthError(w, r, "no code")
		return
	}

	// Exchange code for token
	tokenData, err := h.exchangeCode(provider, providerName, code)
	if err != nil {
		h.oauthError(w, r, "token exchange failed")
		return
	}

	// Fetch user profile
	profile, err := h.fetchProfile(provider, providerName, tokenData)
	if err != nil {
		h.oauthError(w, r, "profile fetch failed")
		return
	}

	// Find or create user
	user, ws, err := h.findOrCreateUser(providerName, profile, tokenData)
	if err != nil {
		h.oauthError(w, r, "user creation failed: "+err.Error())
		return
	}

	// Generate JWT
	tokenStr, err := h.generateJWT(user, ws)
	if err != nil {
		h.oauthError(w, r, "token generation failed")
		return
	}

	// Redirect to frontend callback page
	redirectURL := fmt.Sprintf("%s/oauth-callback?token=%s", h.cfg.OAuthRedirectBase, url.QueryEscape(tokenStr))
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// ─── Token exchange ─────────────────────────────────────

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Email        string `json:"email"`       // VK returns email here
	UserID       int    `json:"user_id"`     // VK returns user_id here
}

func (h *OAuthHandler) exchangeCode(provider *oauthProvider, providerName, code string) (*tokenResponse, error) {
	data := url.Values{
		"client_id":     {provider.ClientID},
		"client_secret": {provider.Secret},
		"code":          {code},
		"redirect_uri":  {h.callbackURL(providerName)},
		"grant_type":    {"authorization_code"},
	}

	resp, err := http.PostForm(provider.TokenURL, data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result tokenResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("invalid token response: %s", string(body))
	}
	if result.AccessToken == "" {
		return nil, fmt.Errorf("no access token: %s", string(body))
	}
	return &result, nil
}

// ─── Profile fetching ───────────────────────────────────

type oauthProfile struct {
	ID        string
	Email     string
	FirstName string
	LastName  string
	AvatarURL string
	Raw       json.RawMessage
}

func (h *OAuthHandler) fetchProfile(provider *oauthProvider, providerName string, token *tokenResponse) (*oauthProfile, error) {
	switch providerName {
	case "vk":
		return h.fetchVKProfile(provider, token)
	case "yandex":
		return h.fetchYandexProfile(provider, token)
	case "google":
		return h.fetchGoogleProfile(provider, token)
	}
	return nil, fmt.Errorf("unknown provider")
}

func (h *OAuthHandler) fetchVKProfile(provider *oauthProvider, token *tokenResponse) (*oauthProfile, error) {
	reqURL := provider.ProfileURL + "&access_token=" + token.AccessToken
	resp, err := http.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Response []struct {
			ID        int    `json:"id"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			Photo200  string `json:"photo_200"`
		} `json:"response"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Response) == 0 {
		return nil, fmt.Errorf("vk profile error: %s", string(body))
	}

	u := result.Response[0]
	return &oauthProfile{
		ID:        fmt.Sprintf("%d", u.ID),
		Email:     token.Email, // VK returns email in token response
		FirstName: u.FirstName,
		LastName:  u.LastName,
		AvatarURL: u.Photo200,
		Raw:       body,
	}, nil
}

func (h *OAuthHandler) fetchYandexProfile(provider *oauthProvider, token *tokenResponse) (*oauthProfile, error) {
	req, _ := http.NewRequest("GET", provider.ProfileURL, nil)
	req.Header.Set("Authorization", "OAuth "+token.AccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var u struct {
		ID           string `json:"id"`
		DefaultEmail string `json:"default_email"`
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		DefaultAvatarID string `json:"default_avatar_id"`
	}
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, fmt.Errorf("yandex profile error: %s", string(body))
	}

	avatar := ""
	if u.DefaultAvatarID != "" {
		avatar = fmt.Sprintf("https://avatars.yandex.net/get-yapic/%s/islands-200", u.DefaultAvatarID)
	}

	return &oauthProfile{
		ID:        u.ID,
		Email:     u.DefaultEmail,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		AvatarURL: avatar,
		Raw:       body,
	}, nil
}

func (h *OAuthHandler) fetchGoogleProfile(provider *oauthProvider, token *tokenResponse) (*oauthProfile, error) {
	req, _ := http.NewRequest("GET", provider.ProfileURL, nil)
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var u struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		GivenName string `json:"given_name"`
		FamilyName string `json:"family_name"`
		Picture   string `json:"picture"`
	}
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, fmt.Errorf("google profile error: %s", string(body))
	}

	return &oauthProfile{
		ID:        u.ID,
		Email:     u.Email,
		FirstName: u.GivenName,
		LastName:  u.FamilyName,
		AvatarURL: u.Picture,
		Raw:       body,
	}, nil
}

// ─── Find or create user ────────────────────────────────

func (h *OAuthHandler) findOrCreateUser(providerName string, profile *oauthProfile, token *tokenResponse) (models.User, *models.WorkspaceMembership, error) {
	ctx := context.Background()

	// 1. Check if OAuth binding exists
	var userID string
	err := h.db.QueryRow(ctx,
		`SELECT user_id FROM user_oauth_providers WHERE provider = $1 AND provider_user_id = $2`,
		providerName, profile.ID,
	).Scan(&userID)

	if err == nil {
		// Existing OAuth user — update token and login
		h.db.Exec(ctx,
			`UPDATE user_oauth_providers SET access_token = $1, refresh_token = $2, raw_profile = $3
			 WHERE provider = $4 AND provider_user_id = $5`,
			token.AccessToken, token.RefreshToken, profile.Raw, providerName, profile.ID)
		return h.loginExistingUser(ctx, userID)
	}

	// 2. Check if email matches an existing user
	if profile.Email != "" {
		err = h.db.QueryRow(ctx,
			`SELECT id FROM users WHERE email = $1`, profile.Email,
		).Scan(&userID)

		if err == nil {
			// Bind OAuth to existing user
			h.db.Exec(ctx,
				`INSERT INTO user_oauth_providers (user_id, provider, provider_user_id, email, access_token, refresh_token, raw_profile)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				userID, providerName, profile.ID, profile.Email, token.AccessToken, token.RefreshToken, profile.Raw)
			// Always update avatar from OAuth provider
			if profile.AvatarURL != "" {
				h.db.Exec(ctx, `UPDATE users SET avatar_url = $1 WHERE id = $2`, profile.AvatarURL, userID)
			}
			return h.loginExistingUser(ctx, userID)
		}
	}

	// 3. Auto-register new user
	return h.autoRegister(ctx, providerName, profile, token)
}

func (h *OAuthHandler) loginExistingUser(ctx context.Context, userID string) (models.User, *models.WorkspaceMembership, error) {
	var user models.User
	err := h.db.QueryRow(ctx,
		`SELECT id, email, first_name, last_name, avatar_url, is_active, is_admin, is_superadmin, created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.AvatarURL, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.CreatedAt)
	if err != nil {
		return user, nil, err
	}

	// Get first workspace
	var ws models.WorkspaceMembership
	err = h.db.QueryRow(ctx,
		`SELECT wm.workspace_id, w.name, w.slug, wm.role, w.is_system
		 FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
		 WHERE wm.user_id = $1 AND w.is_active = true
		 ORDER BY w.is_system DESC, w.name LIMIT 1`, userID,
	).Scan(&ws.WorkspaceID, &ws.Name, &ws.Slug, &ws.Role, &ws.IsSystem)
	if err != nil {
		return user, nil, nil // user without workspaces
	}
	return user, &ws, nil
}

func (h *OAuthHandler) autoRegister(ctx context.Context, providerName string, profile *oauthProfile, token *tokenResponse) (models.User, *models.WorkspaceMembership, error) {
	var user models.User

	email := profile.Email
	if email == "" {
		email = fmt.Sprintf("%s_%s@oauth.custle.local", providerName, profile.ID)
	}

	firstName := profile.FirstName
	if firstName == "" {
		firstName = "User"
	}
	lastName := profile.LastName

	tx, err := h.db.Begin(ctx)
	if err != nil {
		return user, nil, err
	}
	defer tx.Rollback(ctx)

	// Create user (no password)
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, first_name, last_name, avatar_url)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, first_name, last_name, avatar_url, is_active, is_admin, is_superadmin, created_at`,
		email, firstName, lastName, profile.AvatarURL,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.AvatarURL, &user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.CreatedAt)
	if err != nil {
		return user, nil, fmt.Errorf("create user: %w", err)
	}

	// Create workspace
	wsName := firstName
	if lastName != "" {
		wsName += " " + lastName
	}
	slug := generateSlug(wsName)
	var wsID string
	err = tx.QueryRow(ctx,
		`INSERT INTO workspaces (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id`,
		wsName+"'s Workspace", slug, user.ID,
	).Scan(&wsID)
	if err != nil {
		return user, nil, fmt.Errorf("create workspace: %w", err)
	}

	// Add as admin
	_, err = tx.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`,
		wsID, user.ID)
	if err != nil {
		return user, nil, err
	}

	// Seed defaults
	if err := seedWorkspaceDefaults(ctx, tx, wsID); err != nil {
		return user, nil, err
	}

	// Bind OAuth
	_, err = tx.Exec(ctx,
		`INSERT INTO user_oauth_providers (user_id, provider, provider_user_id, email, access_token, refresh_token, raw_profile)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		user.ID, providerName, profile.ID, profile.Email, token.AccessToken, token.RefreshToken, profile.Raw)
	if err != nil {
		return user, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return user, nil, err
	}

	ws := &models.WorkspaceMembership{
		WorkspaceID: wsID,
		Name:        wsName + "'s Workspace",
		Slug:        slug,
		Role:        "admin",
	}
	return user, ws, nil
}

// ─── JWT generation ─────────────────────────────────────

func (h *OAuthHandler) generateJWT(user models.User, ws *models.WorkspaceMembership) (string, error) {
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
	return token.SignedString([]byte(h.cfg.JWTSecret))
}

// ─── Error redirect ─────────────────────────────────────

func (h *OAuthHandler) oauthError(w http.ResponseWriter, r *http.Request, msg string) {
	redirectURL := fmt.Sprintf("%s/login?error=%s", h.cfg.OAuthRedirectBase, url.QueryEscape(msg))
	http.Redirect(w, r, redirectURL, http.StatusFound)
}
