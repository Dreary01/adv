package telegram

import (
	"context"
	"fmt"
	"log"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/custle/api/internal/search"
)

func (b *Bot) handleCommand(api *tgbotapi.BotAPI, msg *tgbotapi.Message) {
	chatID := msg.Chat.ID
	cmd := msg.Command()
	args := msg.CommandArguments()

	switch cmd {
	case "start":
		b.cmdStart(api, chatID, args, msg.From)
	case "help":
		b.cmdHelp(api, chatID)
	case "my":
		b.cmdMy(api, chatID)
	case "today":
		b.cmdToday(api, chatID)
	case "overdue":
		b.cmdOverdue(api, chatID)
	case "search":
		b.cmdSearch(api, chatID, args)
	default:
		reply(api, chatID, "Неизвестная команда. Введите /help")
	}
}

func (b *Bot) cmdStart(api *tgbotapi.BotAPI, chatID int64, args string, from *tgbotapi.User) {
	code := strings.TrimSpace(args)
	if code == "" {
		reply(api, chatID, "Привет! Я бот Custle.\n\nДля привязки аккаунта нажмите «Подключить Telegram» в веб-интерфейсе и отправьте мне полученный код.\n\nВведите /help для списка команд.")
		return
	}

	// Handle invite links: invite_TOKEN
	if strings.HasPrefix(code, "invite_") {
		b.handleInvite(api, chatID, strings.TrimPrefix(code, "invite_"), from)
		return
	}

	userID, ok := b.links.ValidateCode(code)
	if !ok {
		reply(api, chatID, "Код недействителен или истёк. Запросите новый в веб-интерфейсе.")
		return
	}

	username := ""
	if from != nil {
		username = from.UserName
	}

	if err := LinkAccount(context.Background(), b.db, userID, chatID, username); err != nil {
		reply(api, chatID, "Ошибка привязки. Попробуйте ещё раз.")
		return
	}

	reply(api, chatID, "✅ Аккаунт привязан! Вы будете получать уведомления.\n\nВведите /help для списка команд.")
}

// handleInvite processes workspace invitation via Telegram
func (b *Bot) handleInvite(api *tgbotapi.BotAPI, chatID int64, token string, from *tgbotapi.User) {
	ctx := context.Background()

	// 1. Find invitation
	var wsID, role, inviteEmail string
	err := b.db.QueryRow(ctx,
		`SELECT workspace_id, role, email FROM workspace_invitations
		 WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`, token,
	).Scan(&wsID, &role, &inviteEmail)
	if err != nil {
		reply(api, chatID, "Приглашение не найдено или истекло.")
		return
	}

	username := ""
	firstName := ""
	lastName := ""
	if from != nil {
		username = from.UserName
		firstName = from.FirstName
		lastName = from.LastName
	}

	// 2. Check if user already linked
	userID, err := GetLinkedUser(ctx, b.db, chatID)
	if err != nil {
		// No linked account — create new user
		email := fmt.Sprintf("tg_%d@telegram.custle.ru", chatID)
		if username != "" {
			email = username + "@telegram.custle.ru"
		}

		err = b.db.QueryRow(ctx,
			`INSERT INTO users (email, first_name, last_name)
			 VALUES ($1, $2, $3)
			 RETURNING id`, email, firstName, lastName,
		).Scan(&userID)
		if err != nil {
			reply(api, chatID, "Ошибка создания аккаунта.")
			return
		}

		// Link telegram
		LinkAccount(ctx, b.db, userID, chatID, username)
	}

	// 3. Add to workspace
	_, err = b.db.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO NOTHING`, wsID, userID, role)
	if err != nil {
		reply(api, chatID, "Ошибка добавления в пространство.")
		return
	}

	// 4. Mark invitation as accepted
	b.db.Exec(ctx,
		`UPDATE workspace_invitations SET accepted_at = NOW(), accepted_by = $1 WHERE token = $2`,
		userID, token)

	// Get workspace name
	var wsName string
	b.db.QueryRow(ctx, `SELECT name FROM workspaces WHERE id = $1`, wsID).Scan(&wsName)

	reply(api, chatID, fmt.Sprintf("✅ Добро пожаловать в *%s*!\n\nВаша роль: %s\n\nВведите /help для списка команд.", wsName, roleLabel(role)))
}

func (b *Bot) cmdHelp(api *tgbotapi.BotAPI, chatID int64) {
	text := `*Custle Bot*

/my — мои задачи
/today — задачи на сегодня
/overdue — просроченные задачи
/search _запрос_ — поиск
/help — эта справка`
	reply(api, chatID, text)
}

func (b *Bot) cmdMy(api *tgbotapi.BotAPI, chatID int64) {
	userID, wsID, err := b.resolveUser(chatID)
	if err != nil {
		reply(api, chatID, "Аккаунт не привязан. Привяжите через веб-интерфейс.")
		return
	}

	rows, err := b.db.Query(context.Background(),
		`SELECT o.name, o.status, t.name AS type_name,
		        p.end_date::text
		 FROM objects o
		 JOIN object_types t ON t.id = o.type_id
		 LEFT JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
		 WHERE o.workspace_id = $1 AND (o.assignee_id = $2 OR o.owner_id = $2)
		   AND o.status NOT IN ('completed', 'cancelled')
		 ORDER BY p.end_date NULLS LAST, o.created_at DESC
		 LIMIT 15`, wsID, userID)
	if err != nil {
		reply(api, chatID, "Ошибка загрузки задач.")
		return
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var name, status, typeName string
		var endDate *string
		rows.Scan(&name, &status, &typeName, &endDate)
		line := fmt.Sprintf("• %s (%s)", name, statusEmoji(status))
		if endDate != nil && *endDate != "" {
			line += fmt.Sprintf(" → %s", *endDate)
		}
		lines = append(lines, line)
	}

	if len(lines) == 0 {
		reply(api, chatID, "У вас нет активных задач 🎉")
		return
	}

	reply(api, chatID, fmt.Sprintf("*Мои задачи (%d):*\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func (b *Bot) cmdToday(api *tgbotapi.BotAPI, chatID int64) {
	userID, wsID, err := b.resolveUser(chatID)
	if err != nil {
		reply(api, chatID, "Аккаунт не привязан.")
		return
	}

	rows, err := b.db.Query(context.Background(),
		`SELECT o.name, o.status, t.name
		 FROM objects o
		 JOIN object_types t ON t.id = o.type_id
		 JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
		 WHERE o.workspace_id = $1 AND (o.assignee_id = $2 OR o.owner_id = $2)
		   AND o.status NOT IN ('completed', 'cancelled')
		   AND p.end_date = CURRENT_DATE
		 ORDER BY o.name`, wsID, userID)
	if err != nil {
		reply(api, chatID, "Ошибка загрузки.")
		return
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var name, status, typeName string
		rows.Scan(&name, &status, &typeName)
		lines = append(lines, fmt.Sprintf("• %s %s", statusEmoji(status), name))
	}

	if len(lines) == 0 {
		reply(api, chatID, "На сегодня дедлайнов нет ✅")
		return
	}

	reply(api, chatID, fmt.Sprintf("*Дедлайн сегодня (%d):*\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func (b *Bot) cmdOverdue(api *tgbotapi.BotAPI, chatID int64) {
	userID, wsID, err := b.resolveUser(chatID)
	if err != nil {
		reply(api, chatID, "Аккаунт не привязан.")
		return
	}

	rows, err := b.db.Query(context.Background(),
		`SELECT o.name, p.end_date::text
		 FROM objects o
		 JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
		 WHERE o.workspace_id = $1 AND (o.assignee_id = $2 OR o.owner_id = $2)
		   AND o.status NOT IN ('completed', 'cancelled')
		   AND p.end_date < CURRENT_DATE
		 ORDER BY p.end_date
		 LIMIT 20`, wsID, userID)
	if err != nil {
		reply(api, chatID, "Ошибка загрузки.")
		return
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var name string
		var endDate *string
		rows.Scan(&name, &endDate)
		d := ""
		if endDate != nil {
			d = " (до " + *endDate + ")"
		}
		lines = append(lines, fmt.Sprintf("🔴 %s%s", name, d))
	}

	if len(lines) == 0 {
		reply(api, chatID, "Просроченных задач нет ✅")
		return
	}

	reply(api, chatID, fmt.Sprintf("*Просрочено (%d):*\n\n%s", len(lines), strings.Join(lines, "\n")))
}

func (b *Bot) cmdSearch(api *tgbotapi.BotAPI, chatID int64, query string) {
	if strings.TrimSpace(query) == "" {
		b.pending.Store(chatID, "search")
		reply(api, chatID, "Что ищем?")
		return
	}

	_, wsID, err := b.resolveUser(chatID)
	if err != nil {
		reply(api, chatID, "Аккаунт не привязан.")
		return
	}

	results := search.HybridSearch(context.Background(), b.db, wsID, query, 10)
	if len(results) == 0 {
		reply(api, chatID, "Ничего не найдено.")
		return
	}

	var lines []string
	for _, r := range results {
		icon := "📄"
		switch r.Type {
		case "object":
			icon = "📦"
		case "note":
			icon = "📝"
		case "document":
			icon = "📎"
		}
		line := fmt.Sprintf("%s *%s*", icon, r.Title)
		if r.Snippet != "" {
			snippet := r.Snippet
			if len(snippet) > 80 {
				snippet = snippet[:80] + "..."
			}
			line += "\n   _" + snippet + "_"
		}
		lines = append(lines, line)
	}

	reply(api, chatID, fmt.Sprintf("*Результаты (%d):*\n\n%s", len(results), strings.Join(lines, "\n\n")))
}

// resolveUser returns userID and first workspace_id for a telegram chat
func (b *Bot) resolveUser(chatID int64) (string, string, error) {
	ctx := context.Background()
	userID, err := GetLinkedUser(ctx, b.db, chatID)
	if err != nil {
		return "", "", err
	}

	// Get first workspace for user
	var wsID string
	err = b.db.QueryRow(ctx,
		`SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY workspace_id LIMIT 1`,
		userID).Scan(&wsID)
	if err != nil {
		return "", "", fmt.Errorf("no workspace: %w", err)
	}

	return userID, wsID, nil
}

func roleLabel(role string) string {
	switch role {
	case "admin":
		return "Администратор"
	default:
		return "Участник"
	}
}

func statusEmoji(status string) string {
	switch status {
	case "in_progress":
		return "🔵"
	case "not_started":
		return "⚪"
	case "on_hold":
		return "🟡"
	case "completed":
		return "✅"
	case "cancelled":
		return "❌"
	default:
		return "⚪"
	}
}

func (b *Bot) handleText(api *tgbotapi.BotAPI, msg *tgbotapi.Message) {
	chatID := msg.Chat.ID
	text := strings.TrimSpace(msg.Text)

	// Check pending action
	if action, ok := b.pending.LoadAndDelete(chatID); ok {
		switch action.(string) {
		case "search":
			b.cmdSearch(api, chatID, text)
			return
		}
	}

	// Try to interpret as link code (6 digits)
	if len(text) == 6 {
		b.cmdStart(api, chatID, text, msg.From)
		return
	}

	reply(api, chatID, "Введите /help для списка команд")
}

func reply(api *tgbotapi.BotAPI, chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "Markdown"
	_, err := api.Send(msg)
	if err != nil {
		log.Printf("[telegram] Send error to %d: %v", chatID, err)
	}
}
