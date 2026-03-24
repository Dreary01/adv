package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/custle/api/internal/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

const globalWorkspaceID = "00000000-0000-0000-0000-000000000000"

type Bot struct {
	db             *pgxpool.Pool
	mu             sync.RWMutex
	api            *tgbotapi.BotAPI
	enabled        bool
	configHash     string
	cachedUsername string
	links          *LinkStore
	pending        sync.Map // chatID -> pending action string ("search", etc.)
}

func NewBot(db *pgxpool.Pool) *Bot {
	b := &Bot{
		db:    db,
		links: NewLinkStore(),
	}
	b.refresh()
	return b
}

type botConfig struct {
	Token    string
	ProxyURL string
	Enabled  bool
}

func (b *Bot) loadConfig() botConfig {
	rows, err := b.db.Query(context.Background(),
		`SELECT key, value FROM system_settings WHERE workspace_id = $1 AND key LIKE 'telegram.%'`,
		globalWorkspaceID)
	if err != nil {
		return botConfig{}
	}
	defer rows.Close()

	cfg := botConfig{}
	for rows.Next() {
		var key string
		var value json.RawMessage
		if rows.Scan(&key, &value) != nil {
			continue
		}
		var s string
		json.Unmarshal(value, &s)
		switch key {
		case "telegram.bot_token":
			cfg.Token = s
		case "telegram.proxy_url":
			cfg.ProxyURL = s
		case "telegram.enabled":
			var enabled bool
			if json.Unmarshal(value, &enabled) == nil {
				cfg.Enabled = enabled
			} else {
				cfg.Enabled = s == "true"
			}
		}
	}
	return cfg
}

func (b *Bot) refresh() {
	cfg := b.loadConfig()
	hash := cfg.Token + "|" + cfg.ProxyURL + "|" + fmt.Sprintf("%v", cfg.Enabled)

	b.mu.RLock()
	if b.configHash == hash {
		b.mu.RUnlock()
		return
	}
	b.mu.RUnlock()

	b.mu.Lock()
	defer b.mu.Unlock()

	if b.configHash == hash {
		return
	}

	b.enabled = cfg.Enabled
	b.configHash = hash

	if !cfg.Enabled || cfg.Token == "" {
		b.api = nil
		return
	}

	api, err := createBotAPI(cfg.Token, cfg.ProxyURL)
	if err != nil {
		log.Printf("[telegram] Bot init failed: %v", err)
		b.api = nil
		return
	}

	log.Printf("[telegram] Bot connected: @%s", api.Self.UserName)
	b.api = api
}

func createBotAPI(token, proxyURL string) (*tgbotapi.BotAPI, error) {
	if proxyURL != "" {
		parsed, err := url.Parse(proxyURL)
		if err != nil {
			return nil, fmt.Errorf("invalid proxy URL: %w", err)
		}
		transport := &http.Transport{Proxy: http.ProxyURL(parsed)}
		client := &http.Client{Transport: transport}
		return tgbotapi.NewBotAPIWithClient(token, tgbotapi.APIEndpoint, client)
	}
	return tgbotapi.NewBotAPI(token)
}

// HandleWebhook — POST /api/telegram/webhook
func (b *Bot) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	b.refresh()

	b.mu.RLock()
	api := b.api
	enabled := b.enabled
	b.mu.RUnlock()

	if !enabled || api == nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	var update tgbotapi.Update
	if err := json.Unmarshal(body, &update); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	if update.Message != nil {
		log.Printf("[telegram] Message from %d (@%s): %q (cmd=%v)", update.Message.Chat.ID, update.Message.From.UserName, update.Message.Text, update.Message.IsCommand())
		if update.Message.IsCommand() {
			b.handleCommand(api, update.Message)
		} else {
			// Handle plain text — might be a link code
			b.handleText(api, update.Message)
		}
	}

	w.WriteHeader(http.StatusOK)
}

// SendMessage sends a message to a chat
func (b *Bot) SendMessage(chatID int64, text string) error {
	b.mu.RLock()
	api := b.api
	b.mu.RUnlock()

	if api == nil {
		return fmt.Errorf("bot not initialized")
	}

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "Markdown"
	_, err := api.Send(msg)
	return err
}

// GetBotAPI returns the current bot API (for superadmin test)
func (b *Bot) GetBotAPI() *tgbotapi.BotAPI {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.api
}

// TestConnection creates a temporary bot to test token+proxy
func TestConnection(token, proxyURL string) (string, error) {
	api, err := createBotAPI(token, proxyURL)
	if err != nil {
		return "", err
	}
	return api.Self.UserName, nil
}

// GenerateLinkCode — POST /api/telegram/link-code (authenticated)
func (b *Bot) GenerateLinkCode(w http.ResponseWriter, r *http.Request) {
	uid := getUserIDFromCtx(r.Context())
	if uid == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	code := b.links.GenerateCode(uid)
	botUsername := b.GetBotUsername()

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"data":{"code":"%s","bot_username":"%s"}}`, code, botUsername)
}

// LinkStatus — GET /api/telegram/status (authenticated)
func (b *Bot) LinkStatus(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromCtx(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var chatID int64
	var username *string
	err := b.db.QueryRow(context.Background(),
		`SELECT telegram_chat_id, telegram_username FROM user_telegram WHERE user_id = $1`, userID).Scan(&chatID, &username)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		fmt.Fprintf(w, `{"data":{"linked":false,"bot_username":"%s"}}`, b.GetBotUsername())
	} else {
		u := ""
		if username != nil {
			u = *username
		}
		fmt.Fprintf(w, `{"data":{"linked":true,"telegram_username":"%s","bot_username":"%s"}}`, u, b.GetBotUsername())
	}
}

func getUserIDFromCtx(ctx context.Context) string {
	return middleware.GetUserID(ctx)
}

// SetWebhook sets the Telegram webhook URL and registers bot commands
func SetWebhook(token, proxyURL, webhookURL string) error {
	api, err := createBotAPI(token, proxyURL)
	if err != nil {
		return err
	}
	wh, _ := tgbotapi.NewWebhook(webhookURL)
	_, err = api.Request(wh)
	if err != nil {
		return err
	}

	// Register bot menu commands
	commands := tgbotapi.NewSetMyCommands(
		tgbotapi.BotCommand{Command: "my", Description: "Мои задачи"},
		tgbotapi.BotCommand{Command: "today", Description: "Дедлайны на сегодня"},
		tgbotapi.BotCommand{Command: "overdue", Description: "Просроченные задачи"},
		tgbotapi.BotCommand{Command: "search", Description: "Поиск по системе"},
		tgbotapi.BotCommand{Command: "help", Description: "Справка по командам"},
	)
	_, err = api.Request(commands)
	return err
}
