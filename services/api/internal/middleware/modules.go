package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Cache module states for 60s
var moduleCache struct {
	sync.RWMutex
	data    map[string]map[string]bool // workspace_id -> module_name -> enabled
	expires map[string]time.Time       // workspace_id -> expiry
}

func init() {
	moduleCache.data = make(map[string]map[string]bool)
	moduleCache.expires = make(map[string]time.Time)
}

func RequireModule(db *pgxpool.Pool, moduleName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wsID := GetWorkspaceID(r.Context())
			if wsID == "" {
				http.Error(w, `{"error":"workspace required"}`, http.StatusForbidden)
				return
			}

			if isModuleEnabled(r.Context(), db, wsID, moduleName) {
				next.ServeHTTP(w, r)
				return
			}

			http.Error(w, `{"error":"module not enabled"}`, http.StatusForbidden)
		})
	}
}

func isModuleEnabled(ctx context.Context, db *pgxpool.Pool, wsID, moduleName string) bool {
	// Check cache
	moduleCache.RLock()
	if modules, ok := moduleCache.data[wsID]; ok {
		if moduleCache.expires[wsID].After(time.Now()) {
			enabled := modules[moduleName]
			moduleCache.RUnlock()
			return enabled
		}
	}
	moduleCache.RUnlock()

	// Load from DB
	key := "modules." + moduleName
	var valueRaw json.RawMessage
	err := db.QueryRow(ctx,
		`SELECT value FROM system_settings WHERE workspace_id = $1 AND key = $2`,
		wsID, key).Scan(&valueRaw)

	enabled := false
	if err == nil {
		var val struct {
			Enabled bool `json:"enabled"`
		}
		if json.Unmarshal(valueRaw, &val) == nil {
			enabled = val.Enabled
		}
	}

	// Update cache
	moduleCache.Lock()
	if moduleCache.data[wsID] == nil {
		moduleCache.data[wsID] = make(map[string]bool)
	}
	moduleCache.data[wsID][moduleName] = enabled
	moduleCache.expires[wsID] = time.Now().Add(60 * time.Second)
	moduleCache.Unlock()

	return enabled
}

// GetModuleStatuses returns all module statuses for a workspace
func GetModuleStatuses(ctx context.Context, db *pgxpool.Pool, wsID string) map[string]bool {
	result := map[string]bool{"knowledge_base": false}

	rows, err := db.Query(ctx,
		`SELECT key, value FROM system_settings WHERE workspace_id = $1 AND key LIKE 'modules.%'`, wsID)
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var valueRaw json.RawMessage
		if rows.Scan(&key, &valueRaw) != nil {
			continue
		}
		moduleName := key[len("modules."):]
		var val struct {
			Enabled bool `json:"enabled"`
		}
		if json.Unmarshal(valueRaw, &val) == nil {
			result[moduleName] = val.Enabled
		}
	}
	return result
}
