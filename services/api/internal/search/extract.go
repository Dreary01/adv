package search

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Supported text-extractable extensions
var textExtensions = map[string]bool{
	".txt": true, ".md": true, ".csv": true, ".tsv": true,
	".json": true, ".xml": true, ".html": true, ".htm": true,
	".log": true, ".yml": true, ".yaml": true, ".toml": true,
	".ini": true, ".cfg": true, ".conf": true, ".env": true,
	".sql": true, ".go": true, ".py": true, ".js": true,
	".ts": true, ".tsx": true, ".jsx": true, ".css": true,
	".scss": true, ".less": true, ".sh": true, ".bash": true,
	".rs": true, ".java": true, ".kt": true, ".swift": true,
	".rb": true, ".php": true, ".c": true, ".cpp": true,
	".h": true, ".hpp": true, ".cs": true, ".r": true,
	".tex": true, ".bib": true, ".rst": true,
}

// CanExtractText checks if text can be extracted from a file by its name
func CanExtractText(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if textExtensions[ext] {
		return true
	}
	if ext == ".pdf" {
		return true
	}
	return false
}

// ExtractText reads text content from a reader.
// For text files: reads up to 50KB directly.
// For PDF: writes to temp file, runs pdftotext, reads output.
func ExtractText(reader io.Reader, filename string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))

	if ext == ".pdf" {
		return extractPDF(reader)
	}

	if !textExtensions[ext] {
		return "", nil
	}

	// Read up to 50KB
	limited := io.LimitReader(reader, 50*1024)
	var buf bytes.Buffer
	scanner := bufio.NewScanner(limited)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)
	for scanner.Scan() {
		buf.WriteString(scanner.Text())
		buf.WriteByte(' ')
	}
	return buf.String(), nil
}

// extractPDF uses pdftotext (poppler-utils) to extract text from PDF
func extractPDF(reader io.Reader) (string, error) {
	// Write to temp file
	tmp, err := os.CreateTemp("", "custle-pdf-*.pdf")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())

	// Limit to 10MB
	limited := io.LimitReader(reader, 10*1024*1024)
	if _, err := io.Copy(tmp, limited); err != nil {
		tmp.Close()
		return "", err
	}
	tmp.Close()

	// Run pdftotext
	outFile := tmp.Name() + ".txt"
	defer os.Remove(outFile)

	cmd := exec.Command("pdftotext", "-layout", "-enc", "UTF-8", tmp.Name(), outFile)
	if err := cmd.Run(); err != nil {
		// pdftotext not available or failed — return empty
		return "", nil
	}

	// Read result (up to 50KB)
	f, err := os.Open(outFile)
	if err != nil {
		return "", nil
	}
	defer f.Close()

	var buf bytes.Buffer
	scanner := bufio.NewScanner(io.LimitReader(f, 50*1024))
	scanner.Buffer(make([]byte, 64*1024), 64*1024)
	for scanner.Scan() {
		buf.WriteString(scanner.Text())
		buf.WriteByte(' ')
	}
	return buf.String(), nil
}

// UpdateDocumentEmbedding creates/updates the search embedding for a document
func UpdateDocumentEmbedding(ctx context.Context, db *pgxpool.Pool, documentID, filename, contentText string) error {
	// Build searchable text: filename + content
	text := filename + " " + contentText
	vecBytes, err := EmbedText(text)
	if err != nil {
		return err
	}

	_, err = db.Exec(ctx,
		`INSERT INTO document_embeddings (document_id, content_text, vector)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (document_id) DO UPDATE SET content_text = $2, vector = $3`,
		documentID, truncate(contentText, 10000), vecBytes)
	return err
}

// DeleteDocumentEmbedding removes the embedding for a document
func DeleteDocumentEmbedding(ctx context.Context, db *pgxpool.Pool, documentID string) error {
	_, err := db.Exec(ctx,
		`DELETE FROM document_embeddings WHERE document_id = $1`, documentID)
	return err
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}

// SearchDocuments performs TF-IDF search on document embeddings
func SearchDocuments(ctx context.Context, db *pgxpool.Pool, wsID, query string, topK int) []GlobalResult {
	rows, err := db.Query(ctx,
		`SELECT d.id, de.vector, d.name, de.content_text
		 FROM document_embeddings de
		 JOIN documents d ON d.id = de.document_id
		 WHERE d.workspace_id = $1`, wsID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var docs []DocVector
	type docMeta struct {
		Name    string
		Content string
	}
	meta := make(map[string]docMeta)

	for rows.Next() {
		var id string
		var vecJSON []byte
		var name, contentText string
		if err := rows.Scan(&id, &vecJSON, &name, &contentText); err != nil {
			continue
		}
		var vec map[string]float64
		if err := json.Unmarshal(vecJSON, &vec); err != nil {
			continue
		}
		docs = append(docs, DocVector{ID: id, Vector: vec})
		meta[id] = docMeta{Name: name, Content: contentText}
	}

	var results []GlobalResult
	for _, hit := range TFIDFSearch(query, docs, topK) {
		m := meta[hit.ID]
		snippet := findSnippet(m.Content, query, 250)
		results = append(results, GlobalResult{
			Type:    "document",
			ID:      hit.ID,
			Title:   m.Name,
			Snippet: snippet,
			Score:   hit.Score,
			Source:  "semantic",
		})
	}
	return results
}

// findSnippet locates the best matching fragment in text around query words.
// Returns ~windowSize chars centered on the first match, with "..." markers.
func findSnippet(text, query string, windowSize int) string {
	if text == "" {
		return ""
	}
	textLower := strings.ToLower(text)
	queryLower := strings.ToLower(strings.TrimSpace(query))

	// Try each query word, also transliterated variants
	words := strings.Fields(queryLower)
	bestPos := -1
	for _, w := range words {
		if pos := strings.Index(textLower, w); pos >= 0 {
			bestPos = pos
			break
		}
		// Try transliterated
		if isLatin(w) {
			cyr := toCyrillic(w)
			if pos := strings.Index(textLower, cyr); pos >= 0 {
				bestPos = pos
				break
			}
		} else if isCyrillic(w) {
			lat := toLatin(w)
			if pos := strings.Index(textLower, lat); pos >= 0 {
				bestPos = pos
				break
			}
		}
	}

	// Also try the whole query as substring
	if bestPos < 0 {
		if pos := strings.Index(textLower, queryLower); pos >= 0 {
			bestPos = pos
		}
	}

	if bestPos < 0 {
		// No match found — return beginning
		if len(text) <= windowSize {
			return text
		}
		return text[:windowSize] + "..."
	}

	// Center window around match
	half := windowSize / 2
	start := bestPos - half
	if start < 0 {
		start = 0
	}
	end := start + windowSize
	if end > len(text) {
		end = len(text)
		start = end - windowSize
		if start < 0 {
			start = 0
		}
	}

	snippet := text[start:end]
	prefix := ""
	suffix := ""
	if start > 0 {
		prefix = "..."
	}
	if end < len(text) {
		suffix = "..."
	}
	return prefix + strings.TrimSpace(snippet) + suffix
}
