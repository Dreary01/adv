package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	NatsURL     string
	JWTSecret   string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://advanta:advanta_secret_2024@localhost:5433/advanta?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6380/0"),
		NatsURL:     getEnv("NATS_URL", "nats://localhost:4222"),
		JWTSecret:   getEnv("JWT_SECRET", "dev-secret"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
