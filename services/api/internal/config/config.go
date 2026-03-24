package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	NatsURL     string
	JWTSecret   string
	UploadPath  string
	CarboneURL  string

	// OAuth providers
	VKClientID         string
	VKClientSecret     string
	GoogleClientID     string
	GoogleClientSecret string
	YandexClientID     string
	YandexClientSecret string
	OAuthRedirectBase  string // e.g. "https://custle.my01.ru"
}

func Load() *Config {
	return &Config{
		Port:               getEnv("PORT", "8080"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://custle:custle_secret_2024@localhost:5433/custle?sslmode=disable"),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6380/0"),
		NatsURL:            getEnv("NATS_URL", "nats://localhost:4222"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret"),
		UploadPath:         getEnv("UPLOAD_PATH", "/uploads"),
		CarboneURL:         getEnv("CARBONE_URL", "http://custle-carbone:4000"),
		VKClientID:         getEnv("VK_CLIENT_ID", ""),
		VKClientSecret:     getEnv("VK_CLIENT_SECRET", ""),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		YandexClientID:     getEnv("YANDEX_CLIENT_ID", ""),
		YandexClientSecret: getEnv("YANDEX_CLIENT_SECRET", ""),
		OAuthRedirectBase:  getEnv("OAUTH_REDIRECT_BASE", "http://localhost:3002"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
