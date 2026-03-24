package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Storage is the interface for file storage backends.
type Storage interface {
	Save(ctx context.Context, key string, reader io.Reader) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) bool
}

// LocalStorage stores files on the local filesystem.
type LocalStorage struct {
	BasePath string
}

func NewLocalStorage(basePath string) *LocalStorage {
	os.MkdirAll(basePath, 0755)
	return &LocalStorage{BasePath: basePath}
}

func (s *LocalStorage) Save(_ context.Context, key string, reader io.Reader) error {
	fullPath := filepath.Join(s.BasePath, key)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	defer f.Close()
	_, err = io.Copy(f, reader)
	return err
}

func (s *LocalStorage) Get(_ context.Context, key string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(s.BasePath, key))
}

func (s *LocalStorage) Delete(_ context.Context, key string) error {
	return os.Remove(filepath.Join(s.BasePath, key))
}

func (s *LocalStorage) Exists(_ context.Context, key string) bool {
	_, err := os.Stat(filepath.Join(s.BasePath, key))
	return err == nil
}
