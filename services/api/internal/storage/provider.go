package storage

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

const globalWorkspaceID = "00000000-0000-0000-0000-000000000000"

// DynamicStorage reads storage config from DB and delegates to the appropriate backend.
// It caches the backend and rebuilds when config changes.
type DynamicStorage struct {
	db           *pgxpool.Pool
	localPath    string
	mu           sync.RWMutex
	current      Storage
	currentType  string
	currentHash  string
}

func NewDynamicStorage(db *pgxpool.Pool, defaultLocalPath string) *DynamicStorage {
	ds := &DynamicStorage{
		db:        db,
		localPath: defaultLocalPath,
		current:   NewLocalStorage(defaultLocalPath),
		currentType: "local",
	}
	// Try to initialize from DB settings
	ds.refresh()
	return ds
}

func (ds *DynamicStorage) refresh() {
	settings := ds.loadSettings()
	storageType := unquoteJSON(settings["storage.type"])
	if storageType == "" {
		storageType = "local"
	}

	// Build a hash of relevant config to detect changes
	hash := storageType
	if storageType == "s3" {
		hash += unquoteJSON(settings["storage.s3.endpoint"]) +
			unquoteJSON(settings["storage.s3.bucket"]) +
			unquoteJSON(settings["storage.s3.access_key"])
	}

	ds.mu.RLock()
	if ds.currentHash == hash {
		ds.mu.RUnlock()
		return
	}
	ds.mu.RUnlock()

	ds.mu.Lock()
	defer ds.mu.Unlock()

	// Double-check after acquiring write lock
	if ds.currentHash == hash {
		return
	}

	switch storageType {
	case "s3":
		endpoint := unquoteJSON(settings["storage.s3.endpoint"])
		bucket := unquoteJSON(settings["storage.s3.bucket"])
		accessKey := unquoteJSON(settings["storage.s3.access_key"])
		secretKey := unquoteJSON(settings["storage.s3.secret_key"])

		if endpoint == "" || bucket == "" || accessKey == "" || secretKey == "" {
			log.Printf("[storage] S3 config incomplete, falling back to local")
			ds.current = NewLocalStorage(ds.localPath)
			ds.currentType = "local"
		} else {
			s3, err := NewS3Storage(endpoint, accessKey, secretKey, bucket)
			if err != nil {
				log.Printf("[storage] S3 init failed: %v, falling back to local", err)
				ds.current = NewLocalStorage(ds.localPath)
				ds.currentType = "local"
			} else {
				log.Printf("[storage] Switched to S3: %s/%s", endpoint, bucket)
				ds.current = s3
				ds.currentType = "s3"
			}
		}
	default:
		localPath := unquoteJSON(settings["storage.local.path"])
		if localPath == "" {
			localPath = ds.localPath
		}
		ds.current = NewLocalStorage(localPath)
		ds.currentType = "local"
	}
	ds.currentHash = hash
}

func (ds *DynamicStorage) loadSettings() map[string]json.RawMessage {
	rows, err := ds.db.Query(context.Background(),
		`SELECT key, value FROM system_settings WHERE workspace_id = $1 AND key LIKE 'storage.%'`,
		globalWorkspaceID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	result := map[string]json.RawMessage{}
	for rows.Next() {
		var key string
		var value json.RawMessage
		if rows.Scan(&key, &value) == nil {
			result[key] = value
		}
	}
	return result
}

func (ds *DynamicStorage) backend() Storage {
	// Refresh config on each call (cheap — only re-creates if config changed)
	ds.refresh()
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	return ds.current
}

func (ds *DynamicStorage) Save(ctx context.Context, key string, reader io.Reader) error {
	return ds.backend().Save(ctx, key, reader)
}

func (ds *DynamicStorage) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	return ds.backend().Get(ctx, key)
}

func (ds *DynamicStorage) Delete(ctx context.Context, key string) error {
	return ds.backend().Delete(ctx, key)
}

func (ds *DynamicStorage) Exists(ctx context.Context, key string) bool {
	return ds.backend().Exists(ctx, key)
}

func unquoteJSON(raw json.RawMessage) string {
	if raw == nil {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return string(raw)
}

// Type returns the current storage type ("local" or "s3")
func (ds *DynamicStorage) Type() string {
	ds.mu.RLock()
	defer ds.mu.RUnlock()
	return ds.currentType
}

// ForceRefresh reloads config from DB (call after settings are updated)
func (ds *DynamicStorage) ForceRefresh() {
	ds.mu.Lock()
	ds.currentHash = "" // force rebuild
	ds.mu.Unlock()
	ds.refresh()
}

// Ensure DynamicStorage implements Storage
var _ Storage = (*DynamicStorage)(nil)
