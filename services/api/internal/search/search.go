package search

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// GlobalResult represents a search hit across all entity types
type GlobalResult struct {
	Type    string  `json:"type"`    // "object", "note", "document"
	ID      string  `json:"id"`
	Title   string  `json:"title"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
	Source  string  `json:"source"` // "semantic", "fts", "substring", "graph"
}

// HybridSearch performs 4-stage search across notes and objects in a workspace
func HybridSearch(ctx context.Context, db *pgxpool.Pool, wsID, query string, topK int) []GlobalResult {
	results := make(map[string]*GlobalResult) // key: "type:id"

	// Stage 1: Semantic (TF-IDF) — notes
	semanticNotes(ctx, db, wsID, query, topK, results)

	// Stage 2: Semantic (TF-IDF) — objects
	semanticObjects(ctx, db, wsID, query, topK, results)

	// Stage 3: Semantic (TF-IDF) — documents
	for _, r := range SearchDocuments(ctx, db, wsID, query, topK) {
		key := "document:" + r.ID
		if _, exists := results[key]; !exists {
			results[key] = &GlobalResult{Type: r.Type, ID: r.ID, Title: r.Title, Snippet: r.Snippet, Score: r.Score, Source: r.Source}
		}
	}

	// Stage 4: PostgreSQL FTS — notes + objects
	ftsSearch(ctx, db, wsID, query, topK, results)

	// Stage 5: LIKE + transliteration — fallback
	substringSearch(ctx, db, wsID, query, topK, results)

	// Collect and sort
	var out []GlobalResult
	for _, r := range results {
		out = append(out, *r)
	}
	sortGlobalResults(out)
	if len(out) > topK {
		out = out[:topK]
	}
	return out
}

func semanticNotes(ctx context.Context, db *pgxpool.Pool, wsID, query string, topK int, results map[string]*GlobalResult) {
	rows, err := db.Query(ctx,
		`SELECT n.id, ne.vector FROM note_embeddings ne
		 JOIN notes n ON n.id = ne.note_id
		 WHERE n.workspace_id = $1`, wsID)
	if err != nil {
		return
	}
	defer rows.Close()

	var docs []DocVector
	for rows.Next() {
		var id string
		var vecJSON []byte
		if err := rows.Scan(&id, &vecJSON); err != nil {
			continue
		}
		var vec map[string]float64
		if err := json.Unmarshal(vecJSON, &vec); err != nil {
			continue
		}
		docs = append(docs, DocVector{ID: id, Vector: vec})
	}

	for _, hit := range TFIDFSearch(query, docs, topK) {
		key := "note:" + hit.ID
		if _, exists := results[key]; !exists {
			var title, content string
			db.QueryRow(ctx, `SELECT title, left(content, 2000) FROM notes WHERE id = $1`, hit.ID).Scan(&title, &content)
			results[key] = &GlobalResult{Type: "note", ID: hit.ID, Title: title, Snippet: findSnippet(content, query, 250), Score: hit.Score, Source: "semantic"}
		}
	}
}

func semanticObjects(ctx context.Context, db *pgxpool.Pool, wsID, query string, topK int, results map[string]*GlobalResult) {
	rows, err := db.Query(ctx,
		`SELECT o.id, oe.vector FROM object_embeddings oe
		 JOIN objects o ON o.id = oe.object_id
		 WHERE o.workspace_id = $1`, wsID)
	if err != nil {
		return
	}
	defer rows.Close()

	var docs []DocVector
	for rows.Next() {
		var id string
		var vecJSON []byte
		if err := rows.Scan(&id, &vecJSON); err != nil {
			continue
		}
		var vec map[string]float64
		if err := json.Unmarshal(vecJSON, &vec); err != nil {
			continue
		}
		docs = append(docs, DocVector{ID: id, Vector: vec})
	}

	for _, hit := range TFIDFSearch(query, docs, topK) {
		key := "object:" + hit.ID
		if _, exists := results[key]; !exists {
			var name string
			var desc *string
			db.QueryRow(ctx, `SELECT name, left(coalesce(description,''), 2000) FROM objects WHERE id = $1`, hit.ID).Scan(&name, &desc)
			snippet := ""
			if desc != nil {
				snippet = findSnippet(*desc, query, 250)
			}
			results[key] = &GlobalResult{Type: "object", ID: hit.ID, Title: name, Snippet: snippet, Score: hit.Score, Source: "semantic"}
		}
	}
}

func ftsSearch(ctx context.Context, db *pgxpool.Pool, wsID, query string, topK int, results map[string]*GlobalResult) {
	tsQuery := toTSQuery(query)
	if tsQuery == "" {
		return
	}

	// Notes FTS
	rows, err := db.Query(ctx,
		`SELECT id, title, left(content, 200),
		        ts_rank(to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(tags,'')), to_tsquery('russian', $2)) AS rank
		 FROM notes WHERE workspace_id = $1
		 AND to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(tags,'')) @@ to_tsquery('russian', $2)
		 ORDER BY rank DESC LIMIT $3`, wsID, tsQuery, topK)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, title, content string
			var rank float64
			if rows.Scan(&id, &title, &content, &rank) != nil {
				continue
			}
			key := "note:" + id
			if _, exists := results[key]; !exists {
				results[key] = &GlobalResult{Type: "note", ID: id, Title: title, Snippet: content, Score: rank, Source: "fts"}
			}
		}
	}

	// Objects FTS
	rows2, err := db.Query(ctx,
		`SELECT id, name, left(coalesce(description,''), 200),
		        ts_rank(to_tsvector('russian', name || ' ' || coalesce(description,'')), to_tsquery('russian', $2)) AS rank
		 FROM objects WHERE workspace_id = $1
		 AND to_tsvector('russian', name || ' ' || coalesce(description,'')) @@ to_tsquery('russian', $2)
		 ORDER BY rank DESC LIMIT $3`, wsID, tsQuery, topK)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var id, name, desc string
			var rank float64
			if rows2.Scan(&id, &name, &desc, &rank) != nil {
				continue
			}
			key := "object:" + id
			if _, exists := results[key]; !exists {
				results[key] = &GlobalResult{Type: "object", ID: id, Title: name, Snippet: desc, Score: rank, Source: "fts"}
			}
		}
	}
}

func substringSearch(ctx context.Context, db *pgxpool.Pool, wsID, query string, topK int, results map[string]*GlobalResult) {
	patterns := generateLikePatterns(query)

	for _, pat := range patterns {
		// Notes
		rows, err := db.Query(ctx,
			`SELECT id, title, left(content, 200) FROM notes
			 WHERE workspace_id = $1 AND (title ILIKE $2 OR content ILIKE $2 OR tags ILIKE $2)
			 LIMIT $3`, wsID, pat, topK)
		if err == nil {
			for rows.Next() {
				var id, title, content string
				if rows.Scan(&id, &title, &content) != nil {
					continue
				}
				key := "note:" + id
				if _, exists := results[key]; !exists {
					results[key] = &GlobalResult{Type: "note", ID: id, Title: title, Snippet: content, Score: 0.5, Source: "substring"}
				}
			}
			rows.Close()
		}

		// Objects
		rows2, err := db.Query(ctx,
			`SELECT id, name, left(coalesce(description,''), 200) FROM objects
			 WHERE workspace_id = $1 AND (name ILIKE $2 OR description ILIKE $2)
			 LIMIT $3`, wsID, pat, topK)
		if err == nil {
			for rows2.Next() {
				var id, name, desc string
				if rows2.Scan(&id, &name, &desc) != nil {
					continue
				}
				key := "object:" + id
				if _, exists := results[key]; !exists {
					results[key] = &GlobalResult{Type: "object", ID: id, Title: name, Snippet: desc, Score: 0.5, Source: "substring"}
				}
			}
			rows2.Close()
		}

		// Documents
		rows3, err := db.Query(ctx,
			`SELECT id, name, object_id FROM documents
			 WHERE workspace_id = $1 AND name ILIKE $2
			 LIMIT $3`, wsID, pat, topK)
		if err == nil {
			for rows3.Next() {
				var id, name string
				var objectID *string
				if rows3.Scan(&id, &name, &objectID) != nil {
					continue
				}
				key := "document:" + id
				if _, exists := results[key]; !exists {
					results[key] = &GlobalResult{Type: "document", ID: id, Title: name, Score: 0.4, Source: "substring"}
				}
			}
			rows3.Close()
		}
	}
}

// ─── Helpers ────────────────────────────────────────────

func toTSQuery(query string) string {
	words := strings.Fields(query)
	var parts []string
	for _, w := range words {
		w = strings.TrimSpace(w)
		if len(w) >= 2 {
			parts = append(parts, w+":*")
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, " & ")
}

func generateLikePatterns(query string) []string {
	q := strings.ToLower(strings.TrimSpace(query))
	patterns := []string{"%" + q + "%"}

	words := strings.Fields(q)
	for _, w := range words {
		if isLatin(w) {
			cyr := toCyrillic(w)
			patterns = append(patterns, "%"+cyr+"%")
		} else if isCyrillic(w) {
			lat := toLatin(w)
			patterns = append(patterns, "%"+lat+"%")
		}
	}
	return patterns
}

func sortGlobalResults(results []GlobalResult) {
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].Score > results[j-1].Score; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}
}

// EmbedText computes TF vector and serializes to JSON bytes for storage
func EmbedText(text string) ([]byte, error) {
	tf := ComputeTF(text)
	if tf == nil {
		tf = map[string]float64{}
	}
	return json.Marshal(tf)
}

// UpdateNoteEmbedding recomputes and stores embedding for a note
func UpdateNoteEmbedding(ctx context.Context, db *pgxpool.Pool, noteID, title, content, tags string) error {
	text := fmt.Sprintf("%s %s %s", title, content, tags)
	vecBytes, err := EmbedText(text)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx,
		`INSERT INTO note_embeddings (note_id, vector) VALUES ($1, $2)
		 ON CONFLICT (note_id) DO UPDATE SET vector = $2`, noteID, vecBytes)
	return err
}

// UpdateObjectEmbedding recomputes and stores embedding for an object
func UpdateObjectEmbedding(ctx context.Context, db *pgxpool.Pool, objectID, name, description string) error {
	text := fmt.Sprintf("%s %s", name, description)
	vecBytes, err := EmbedText(text)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx,
		`INSERT INTO object_embeddings (object_id, vector) VALUES ($1, $2)
		 ON CONFLICT (object_id) DO UPDATE SET vector = $2`, objectID, vecBytes)
	return err
}
