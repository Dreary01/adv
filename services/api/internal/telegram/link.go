package telegram

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type linkEntry struct {
	UserID    string
	ExpiresAt time.Time
}

type LinkStore struct {
	mu    sync.Mutex
	codes map[string]linkEntry
}

func NewLinkStore() *LinkStore {
	return &LinkStore{codes: make(map[string]linkEntry)}
}

func (s *LinkStore) GenerateCode(userID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clean expired
	now := time.Now()
	for k, v := range s.codes {
		if now.After(v.ExpiresAt) {
			delete(s.codes, k)
		}
	}

	// Remove existing codes for this user
	for k, v := range s.codes {
		if v.UserID == userID {
			delete(s.codes, k)
		}
	}

	code := generateRandomCode()
	s.codes[code] = linkEntry{
		UserID:    userID,
		ExpiresAt: now.Add(5 * time.Minute),
	}
	return code
}

func (s *LinkStore) ValidateCode(code string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.codes[code]
	if !ok || time.Now().After(entry.ExpiresAt) {
		delete(s.codes, code)
		return "", false
	}

	delete(s.codes, code)
	return entry.UserID, true
}

func generateRandomCode() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

// LinkAccount binds telegram chat to user
func LinkAccount(ctx context.Context, db *pgxpool.Pool, userID string, chatID int64, username string) error {
	_, err := db.Exec(ctx,
		`INSERT INTO user_telegram (user_id, telegram_chat_id, telegram_username)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id) DO UPDATE SET telegram_chat_id = $2, telegram_username = $3, connected_at = now()`,
		userID, chatID, username)
	return err
}

// GetLinkedUser returns user_id by telegram chat_id
func GetLinkedUser(ctx context.Context, db *pgxpool.Pool, chatID int64) (string, error) {
	var userID string
	err := db.QueryRow(ctx,
		`SELECT user_id FROM user_telegram WHERE telegram_chat_id = $1`, chatID).Scan(&userID)
	return userID, err
}

// IsLinked checks if a telegram chat is linked
func IsLinked(ctx context.Context, db *pgxpool.Pool, chatID int64) bool {
	var exists bool
	db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM user_telegram WHERE telegram_chat_id = $1)`, chatID).Scan(&exists)
	return exists
}

// GetBotUsername returns the bot username — from running bot or by testing token from DB
func (b *Bot) GetBotUsername() string {
	b.mu.RLock()
	api := b.api
	cached := b.cachedUsername
	b.mu.RUnlock()

	if api != nil {
		return api.Self.UserName
	}
	if cached != "" {
		return cached
	}

	// Fallback: try to get username by testing the token from DB
	cfg := b.loadConfig()
	if cfg.Token == "" {
		return ""
	}
	username, err := TestConnection(cfg.Token, cfg.ProxyURL)
	if err != nil {
		return ""
	}

	b.mu.Lock()
	b.cachedUsername = username
	b.mu.Unlock()
	return username
}
