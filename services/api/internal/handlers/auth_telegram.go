package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/custle/api/internal/models"
)

// TelegramWebAppAuth — POST /api/auth/telegram-webapp
// Validates Telegram WebApp initData and returns JWT
func (h *AuthHandler) TelegramWebAppAuth(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InitData string `json:"init_data"`
	}
	if err := decodeJSON(r, &req); err != nil || req.InitData == "" {
		writeError(w, http.StatusBadRequest, "init_data required")
		return
	}

	// Load bot token from global settings
	var botToken string
	h.db.QueryRow(context.Background(),
		`SELECT value FROM system_settings WHERE workspace_id = '00000000-0000-0000-0000-000000000000' AND key = 'telegram.bot_token'`,
	).Scan(&botToken)

	// Unquote JSON string
	var unquoted string
	if json.Unmarshal([]byte(botToken), &unquoted) == nil {
		botToken = unquoted
	}

	if botToken == "" {
		writeError(w, http.StatusServiceUnavailable, "telegram bot not configured")
		return
	}

	// Validate HMAC
	tgUser, err := validateInitData(req.InitData, botToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid init_data: "+err.Error())
		return
	}

	// Find user by telegram_chat_id
	var userID string
	err = h.db.QueryRow(context.Background(),
		`SELECT user_id FROM user_telegram WHERE telegram_chat_id = $1`, tgUser.ID,
	).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "telegram account not linked — use /start in bot first")
		return
	}

	// Load user
	var user models.User
	err = h.db.QueryRow(context.Background(),
		`SELECT id, email, first_name, last_name, avatar_url, is_active, is_admin, is_superadmin, created_at
		 FROM users WHERE id = $1`, userID,
	).Scan(&user.ID, &user.Email, &user.FirstName, &user.LastName, &user.AvatarURL,
		&user.IsActive, &user.IsAdmin, &user.IsSuperAdmin, &user.CreatedAt)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}
	if !user.IsActive {
		writeError(w, http.StatusForbidden, "account disabled")
		return
	}

	// Get first workspace
	workspaces, _ := h.getUserWorkspaces(context.Background(), user.ID)
	var ws *models.WorkspaceMembership
	if len(workspaces) > 0 {
		ws = &workspaces[0]
	}

	token, err := h.generateToken(user, ws)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token generation failed")
		return
	}

	writeJSON(w, http.StatusOK, models.LoginResponse{
		Token:      token,
		User:       user,
		Workspace:  ws,
		Workspaces: workspaces,
	})
}

type tgWebAppUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
}

// validateInitData checks HMAC-SHA256 signature per Telegram docs
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
func validateInitData(initData, botToken string) (*tgWebAppUser, error) {
	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, fmt.Errorf("parse error")
	}

	hash := values.Get("hash")
	if hash == "" {
		return nil, fmt.Errorf("no hash")
	}

	// Build check string: sorted key=value pairs excluding hash
	var pairs []string
	for k, v := range values {
		if k == "hash" {
			continue
		}
		pairs = append(pairs, k+"="+v[0])
	}
	sort.Strings(pairs)
	checkString := strings.Join(pairs, "\n")

	// HMAC: secret_key = HMAC_SHA256("WebAppData", bot_token)
	secretKey := hmacSHA256([]byte("WebAppData"), []byte(botToken))
	// data_check = HMAC_SHA256(secret_key, check_string)
	dataCheck := hmacSHA256(secretKey, []byte(checkString))
	dataCheckHex := hex.EncodeToString(dataCheck)

	if dataCheckHex != hash {
		return nil, fmt.Errorf("signature mismatch")
	}

	// Parse user
	userJSON := values.Get("user")
	if userJSON == "" {
		return nil, fmt.Errorf("no user data")
	}
	var user tgWebAppUser
	if err := json.Unmarshal([]byte(userJSON), &user); err != nil {
		return nil, fmt.Errorf("user parse error")
	}

	return &user, nil
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

