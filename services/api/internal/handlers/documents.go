package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/search"
	"github.com/custle/api/internal/storage"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DocumentHandler struct {
	db      *pgxpool.Pool
	storage storage.Storage
}

func NewDocumentHandler(db *pgxpool.Pool, store storage.Storage) *DocumentHandler {
	return &DocumentHandler{db: db, storage: store}
}

// SVAR-compatible file entry
type svarFile struct {
	ID         string    `json:"id"`
	Size       int64     `json:"size"`
	Date       time.Time `json:"date"`
	Type       string    `json:"type"`
	Parent     string    `json:"parent,omitempty"`
	ObjectName *string   `json:"object_name,omitempty"`
	AuthorName *string   `json:"author_name,omitempty"`
	DocID      string    `json:"doc_id"` // real UUID for operations
}

// ListFiles — GET /api/objects/{id}/documents/files
// Returns files for this object + all descendants (recursive via LTREE).
func (h *DocumentHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT d.id, d.object_id, d.name, COALESCE(d.file_size, 0), COALESCE(d.mime_type, ''),
		        d.parent_path, d.created_at,
		        u.first_name || ' ' || u.last_name AS author_name,
		        o.name AS object_name
		 FROM documents d
		 LEFT JOIN users u ON u.id = d.created_by
		 JOIN objects o ON o.id = d.object_id
		 WHERE d.workspace_id = $2 AND d.object_id IN (
		   SELECT id FROM objects WHERE id = $1 AND workspace_id = $2
		   UNION ALL
		   SELECT id FROM objects WHERE path <@ (SELECT path FROM objects WHERE id = $1 AND workspace_id = $2) AND id != $1 AND workspace_id = $2
		 )
		 ORDER BY d.name`, objectID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var files []svarFile
	for rows.Next() {
		var docID, objID, name, mimeType, parentPath string
		var size int64
		var createdAt time.Time
		var authorName, objectName *string
		if err := rows.Scan(&docID, &objID, &name, &size, &mimeType,
			&parentPath, &createdAt, &authorName, &objectName); err != nil {
			continue
		}
		files = append(files, svarFile{
			ID:         "/" + name,
			Size:       size,
			Date:       createdAt,
			Type:       "file",
			Parent:     "/",
			ObjectName: objectName,
			AuthorName: authorName,
			DocID:      docID,
		})
	}
	if files == nil {
		files = []svarFile{}
	}
	writeJSON(w, http.StatusOK, files)
}

// Upload — POST /api/objects/{id}/documents/upload
func (h *DocumentHandler) Upload(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	if err := r.ParseMultipartForm(100 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "file too large or invalid form")
		return
	}

	file, header, err := r.FormFile("upload")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	parentPath := r.URL.Query().Get("id")
	if parentPath == "" {
		parentPath = "/"
	}

	storageKey := path.Join(wsID, objectID, header.Filename)

	if err := h.storage.Save(r.Context(), storageKey, file); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save file: "+err.Error())
		return
	}

	var docID string
	err = h.db.QueryRow(context.Background(),
		`INSERT INTO documents (workspace_id, object_id, name, file_path, file_size, mime_type, parent_path, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id`,
		wsID, objectID, header.Filename, storageKey, header.Size, header.Header.Get("Content-Type"), parentPath, userID,
	).Scan(&docID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db insert failed: "+err.Error())
		return
	}

	// Extract text and create search embedding (async, non-blocking)
	if search.CanExtractText(header.Filename) {
		go func() {
			reader, err := h.storage.Get(context.Background(), storageKey)
			if err != nil {
				return
			}
			defer reader.Close()
			text, err := search.ExtractText(reader, header.Filename)
			if err != nil || text == "" {
				return
			}
			search.UpdateDocumentEmbedding(context.Background(), h.db, docID, header.Filename, text)
		}()
	} else {
		// Even for non-text files, index the filename
		go search.UpdateDocumentEmbedding(context.Background(), h.db, docID, header.Filename, "")
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": "/" + header.Filename, "doc_id": docID})
}

// Download — GET /api/documents/{docId}/download
// Authenticated — token checked by middleware.
func (h *DocumentHandler) Download(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "docId")
	wsID := middleware.GetWorkspaceID(r.Context())

	var storagePath, name, mimeType string
	err := h.db.QueryRow(context.Background(),
		`SELECT file_path, name, COALESCE(mime_type, 'application/octet-stream')
		 FROM documents WHERE id = $1 AND workspace_id = $2`, docID, wsID).Scan(&storagePath, &name, &mimeType)
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}

	reader, err := h.storage.Get(r.Context(), storagePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage error: "+err.Error())
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	io.Copy(w, reader)
}

// DeleteFiles — DELETE /api/objects/{id}/documents/files
// Body: {"ids": ["doc-uuid-1", "doc-uuid-2"]}
func (h *DocumentHandler) DeleteFiles(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	for _, docID := range req.IDs {
		// Delete embedding first (cascade will also handle it, but be explicit)
		search.DeleteDocumentEmbedding(context.Background(), h.db, docID)
		var storagePath string
		err := h.db.QueryRow(context.Background(),
			`DELETE FROM documents WHERE id = $1 AND workspace_id = $2 RETURNING file_path`, docID, wsID).Scan(&storagePath)
		if err == nil && storagePath != "" {
			h.storage.Delete(context.Background(), storagePath)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"data": nil})
}

// CreateFile — POST /api/objects/{id}/documents/files/*
func (h *DocumentHandler) CreateFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": "/" + req.Name})
}

// UpdateFile — PUT /api/objects/{id}/documents/files/*
func (h *DocumentHandler) UpdateFile(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		Operation string `json:"operation"`
		Name      string `json:"name"`
		DocID     string `json:"doc_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if req.Operation == "rename" && req.Name != "" && req.DocID != "" {
		h.db.Exec(context.Background(),
			`UPDATE documents SET name = $1 WHERE id = $2 AND workspace_id = $3`, req.Name, req.DocID, wsID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": "/" + req.Name})
}

// IndexStatus — GET /api/objects/{id}/documents/index-status
// Returns tokenization status for all documents of this object (and descendants).
func (h *DocumentHandler) IndexStatus(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT d.id, (de.document_id IS NOT NULL) AS indexed
		 FROM documents d
		 LEFT JOIN document_embeddings de ON de.document_id = d.id
		 WHERE d.workspace_id = $1 AND d.object_id IN (
		   SELECT id FROM objects WHERE id = $2 AND workspace_id = $1
		   UNION ALL
		   SELECT id FROM objects WHERE path <@ (SELECT path FROM objects WHERE id = $2 AND workspace_id = $1) AND id != $2 AND workspace_id = $1
		 )`, wsID, objectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type docIndex struct {
		DocID   string `json:"doc_id"`
		Indexed bool   `json:"indexed"`
	}
	var result []docIndex
	for rows.Next() {
		var d docIndex
		if err := rows.Scan(&d.DocID, &d.Indexed); err != nil {
			continue
		}
		result = append(result, d)
	}
	if result == nil {
		result = []docIndex{}
	}
	writeJSON(w, http.StatusOK, result)
}

// Reindex — POST /api/objects/{id}/documents/reindex
// Indexes all unindexed documents for this object (and descendants).
func (h *DocumentHandler) Reindex(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT d.id, d.name, d.file_path FROM documents d
		 LEFT JOIN document_embeddings de ON de.document_id = d.id
		 WHERE d.workspace_id = $1 AND de.document_id IS NULL
		 AND d.object_id IN (
		   SELECT id FROM objects WHERE id = $2 AND workspace_id = $1
		   UNION ALL
		   SELECT id FROM objects WHERE path <@ (SELECT path FROM objects WHERE id = $2 AND workspace_id = $1) AND id != $2 AND workspace_id = $1
		 )`, wsID, objectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type doc struct{ id, name, filePath string }
	var docs []doc
	for rows.Next() {
		var d doc
		if rows.Scan(&d.id, &d.name, &d.filePath) == nil {
			docs = append(docs, d)
		}
	}

	// Index in background
	go func() {
		for _, d := range docs {
			contentText := ""
			if search.CanExtractText(d.name) {
				reader, err := h.storage.Get(context.Background(), d.filePath)
				if err == nil {
					text, _ := search.ExtractText(reader, d.name)
					reader.Close()
					contentText = text
				}
			}
			search.UpdateDocumentEmbedding(context.Background(), h.db, d.id, d.name, contentText)
		}
	}()

	writeJSON(w, http.StatusOK, map[string]int{"queued": len(docs)})
}

// Info — GET /api/objects/{id}/documents/info
func (h *DocumentHandler) Info(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"features": map[string]bool{
			"upload": true, "download": true, "rename": true,
			"delete": true, "copy": false, "move": false,
		},
	})
}
