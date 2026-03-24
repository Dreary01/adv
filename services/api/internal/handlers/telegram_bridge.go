package handlers

import (
	"github.com/custle/api/internal/telegram"
)

func telegramTestConnection(token, proxyURL string) (string, error) {
	return telegram.TestConnection(token, proxyURL)
}

func telegramSetWebhook(token, proxyURL, webhookURL string) error {
	return telegram.SetWebhook(token, proxyURL, webhookURL)
}
