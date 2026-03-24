package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/search"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type NoteHandler struct {
	db *pgxpool.Pool
}

func NewNoteHandler(db *pgxpool.Pool) *NoteHandler {
	return &NoteHandler{db: db}
}

type noteResponse struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Content     string          `json:"content"`
	ContentJSON json.RawMessage `json:"content_json,omitempty"`
	Tags        string          `json:"tags"`
	IsPrivate   bool            `json:"is_private"`
	CreatedBy   *string         `json:"created_by,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// List returns notes for the workspace: shared notes + user's private notes.
func (h *NoteHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT id, title, content, content_json, tags, is_private, created_by, created_at, updated_at
		 FROM notes
		 WHERE workspace_id = $1 AND (is_private = false OR created_by = $2)
		 ORDER BY updated_at DESC`, wsID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var notes []noteResponse
	for rows.Next() {
		var n noteResponse
		if err := rows.Scan(&n.ID, &n.Title, &n.Content, &n.ContentJSON,
			&n.Tags, &n.IsPrivate, &n.CreatedBy, &n.CreatedAt, &n.UpdatedAt); err != nil {
			continue
		}
		notes = append(notes, n)
	}
	if notes == nil {
		notes = []noteResponse{}
	}
	writeJSONList(w, notes, len(notes))
}

// Get returns a single note by ID (checks private access).
func (h *NoteHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var n noteResponse
	err := h.db.QueryRow(context.Background(),
		`SELECT id, title, content, content_json, tags, is_private, created_by, created_at, updated_at
		 FROM notes
		 WHERE id = $1 AND workspace_id = $2 AND (is_private = false OR created_by = $3)`, id, wsID, userID,
	).Scan(&n.ID, &n.Title, &n.Content, &n.ContentJSON,
		&n.Tags, &n.IsPrivate, &n.CreatedBy, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "note not found")
		return
	}
	writeJSON(w, http.StatusOK, n)
}

// Create adds a new note and triggers embedding update.
func (h *NoteHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Title       string          `json:"title"`
		Content     string          `json:"content"`
		ContentJSON json.RawMessage `json:"content_json"`
		Tags        string          `json:"tags"`
		IsPrivate   *bool           `json:"is_private"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	isPrivate := true // default
	if req.IsPrivate != nil {
		isPrivate = *req.IsPrivate
	}

	var createdBy *string
	if userID != "" {
		createdBy = &userID
	}

	var n noteResponse
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO notes (workspace_id, title, content, content_json, tags, is_private, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, title, content, content_json, tags, is_private, created_by, created_at, updated_at`,
		wsID, req.Title, req.Content, req.ContentJSON, req.Tags, isPrivate, createdBy,
	).Scan(&n.ID, &n.Title, &n.Content, &n.ContentJSON,
		&n.Tags, &n.IsPrivate, &n.CreatedBy, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create note failed: "+err.Error())
		return
	}

	// Update embedding asynchronously
	go search.UpdateNoteEmbedding(context.Background(), h.db, n.ID, n.Title, n.Content, n.Tags)

	writeJSON(w, http.StatusCreated, n)
}

// Update modifies an existing note and re-embeds.
func (h *NoteHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Title       string          `json:"title"`
		Content     string          `json:"content"`
		ContentJSON json.RawMessage `json:"content_json"`
		Tags        string          `json:"tags"`
		IsPrivate   *bool           `json:"is_private"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	isPrivate := true
	if req.IsPrivate != nil {
		isPrivate = *req.IsPrivate
	} else {
		// Keep current value
		h.db.QueryRow(context.Background(), `SELECT is_private FROM notes WHERE id = $1`, id).Scan(&isPrivate)
	}

	var n noteResponse
	err := h.db.QueryRow(context.Background(),
		`UPDATE notes SET
			title = COALESCE(NULLIF($1, ''), title),
			content = $2,
			content_json = $3,
			tags = $4,
			is_private = $5,
			updated_at = NOW()
		 WHERE id = $6 AND workspace_id = $7 AND (is_private = false OR created_by = $8)
		 RETURNING id, title, content, content_json, tags, is_private, created_by, created_at, updated_at`,
		req.Title, req.Content, req.ContentJSON, req.Tags, isPrivate, id, wsID, userID,
	).Scan(&n.ID, &n.Title, &n.Content, &n.ContentJSON,
		&n.Tags, &n.IsPrivate, &n.CreatedBy, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "note not found")
		return
	}

	// Re-embed asynchronously
	go search.UpdateNoteEmbedding(context.Background(), h.db, n.ID, n.Title, n.Content, n.Tags)

	writeJSON(w, http.StatusOK, n)
}

// Delete removes a note.
func (h *NoteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	tag, err := h.db.Exec(context.Background(),
		`DELETE FROM notes WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "delete failed: "+err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "note not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetGraph returns a BFS traversal of note_links starting from a note.
// Query param: depth (default 2).
func (h *NoteHandler) GetGraph(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	depthStr := r.URL.Query().Get("depth")
	maxDepth := 2
	if depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil && d > 0 {
			maxDepth = d
		}
	}

	type graphNode struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Depth int    `json:"depth"`
	}
	type graphEdge struct {
		ID       string `json:"id"`
		Source   string `json:"source"`
		Target   string `json:"target"`
		LinkType string `json:"link_type"`
	}

	// BFS
	visited := map[string]bool{}
	queue := []struct {
		noteID string
		depth  int
	}{{id, 0}}
	visited[id] = true

	var nodes []graphNode
	var edges []graphEdge

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		// Fetch node title
		var title string
		err := h.db.QueryRow(context.Background(),
			`SELECT title FROM notes WHERE id = $1 AND workspace_id = $2`,
			current.noteID, wsID).Scan(&title)
		if err != nil {
			continue
		}
		nodes = append(nodes, graphNode{ID: current.noteID, Title: title, Depth: current.depth})

		if current.depth >= maxDepth {
			continue
		}

		// Find linked notes (both directions)
		rows, err := h.db.Query(context.Background(),
			`SELECT id, source_id, target_id, link_type
			 FROM note_links
			 WHERE workspace_id = $1 AND (source_id = $2 OR target_id = $2)`,
			wsID, current.noteID)
		if err != nil {
			continue
		}

		for rows.Next() {
			var e graphEdge
			if err := rows.Scan(&e.ID, &e.Source, &e.Target, &e.LinkType); err != nil {
				continue
			}
			edges = append(edges, e)

			// Determine the neighbor
			neighbor := e.Target
			if neighbor == current.noteID {
				neighbor = e.Source
			}
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, struct {
					noteID string
					depth  int
				}{neighbor, current.depth + 1})
			}
		}
		rows.Close()
	}

	if nodes == nil {
		nodes = []graphNode{}
	}
	if edges == nil {
		edges = []graphEdge{}
	}

	// Deduplicate edges
	seen := map[string]bool{}
	var uniqueEdges []graphEdge
	for _, e := range edges {
		if !seen[e.ID] {
			seen[e.ID] = true
			uniqueEdges = append(uniqueEdges, e)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"nodes": nodes,
		"edges": uniqueEdges,
	})
}

// WordCloud — GET /api/knowledge-graph/word-cloud
// Extracts original words from source texts (not TF-IDF tokens which include derivatives)
func (h *NoteHandler) WordCloud(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	ctx := context.Background()

	type wordEntry struct {
		Word   string  `json:"word"`
		Weight float64 `json:"weight"`
		Count  int     `json:"count"`
		Source string  `json:"source"`
	}

	type cloudStats struct {
		Notes     int         `json:"notes"`
		Articles  int         `json:"articles"`
		Documents int         `json:"documents"`
		Words     []wordEntry `json:"words"`
	}

	var noteCount, articleCount, docCount int
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM notes WHERE workspace_id = $1`, wsID).Scan(&noteCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM articles WHERE workspace_id = $1`, wsID).Scan(&articleCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM document_embeddings de JOIN documents d ON d.id = de.document_id WHERE d.workspace_id = $1`, wsID).Scan(&docCount)

	// Count raw words from original texts (not from TF-IDF vectors)
	wordCounts := make(map[string]int)
	wordSources := make(map[string]string)
	wordRe := regexp.MustCompile(`[\p{L}]{4,}`) // Unicode letters, 4+ chars
	urlRe := regexp.MustCompile(`https?://\S+`)

	// Notes: title + content
	rows, _ := h.db.Query(ctx, `SELECT title, left(content, 5000) FROM notes WHERE workspace_id = $1`, wsID)
	if rows != nil {
		for rows.Next() {
			var title, content string
			rows.Scan(&title, &content)
			text := urlRe.ReplaceAllString(strings.ToLower(title+" "+content), "")
			for _, w := range wordRe.FindAllString(text, -1) {
				wordCounts[w]++
				if _, ok := wordSources[w]; !ok { wordSources[w] = "note" }
			}
		}
		rows.Close()
	}

	// Objects: name + description
	rows, _ = h.db.Query(ctx, `SELECT name, left(coalesce(description,''), 2000) FROM objects WHERE workspace_id = $1`, wsID)
	if rows != nil {
		for rows.Next() {
			var name, desc string
			rows.Scan(&name, &desc)
			text := urlRe.ReplaceAllString(strings.ToLower(name+" "+desc), "")
			for _, w := range wordRe.FindAllString(text, -1) {
				wordCounts[w]++
				if _, ok := wordSources[w]; !ok { wordSources[w] = "object" }
			}
		}
		rows.Close()
	}

	// Documents: extracted content_text
	rows, _ = h.db.Query(ctx,
		`SELECT left(de.content_text, 5000) FROM document_embeddings de
		 JOIN documents d ON d.id = de.document_id WHERE d.workspace_id = $1`, wsID)
	if rows != nil {
		for rows.Next() {
			var text string
			rows.Scan(&text)
			cleaned := urlRe.ReplaceAllString(strings.ToLower(text), "")
			for _, w := range wordRe.FindAllString(cleaned, -1) {
				wordCounts[w]++
				if _, ok := wordSources[w]; !ok { wordSources[w] = "document" }
			}
		}
		rows.Close()
	}

	// Filter stop words and build result
	var words []wordEntry
	for word, count := range wordCounts {
		if isStopWord(word) {
			continue
		}
		words = append(words, wordEntry{Word: word, Weight: float64(count), Count: count, Source: wordSources[word]})
	}

	sort.Slice(words, func(i, j int) bool { return words[i].Weight > words[j].Weight })
	if len(words) > 80 {
		words = words[:80]
	}
	if words == nil {
		words = []wordEntry{}
	}

	writeJSON(w, http.StatusOK, cloudStats{
		Notes: noteCount, Articles: articleCount, Documents: docCount, Words: words,
	})
}

var stopWords = map[string]bool{
	// Russian
	"этот": true, "этой": true, "этих": true, "этом": true, "того": true,
	"быть": true, "было": true, "будет": true, "была": true, "были": true,
	"есть": true, "если": true, "этого": true, "этому": true,
	"также": true, "такой": true, "такие": true, "таких": true,
	"может": true, "могут": true, "более": true, "менее": true,
	"после": true, "перед": true, "через": true, "между": true,
	"когда": true, "тогда": true, "потом": true,
	"свой": true, "своей": true, "своих": true, "свою": true, "своим": true,
	"весь": true, "всей": true, "всех": true, "всего": true,
	"каждый": true, "каждой": true, "каждого": true,
	"один": true, "одна": true, "одно": true, "одной": true, "одного": true,
	"другой": true, "другие": true, "других": true,
	"только": true, "очень": true, "какой": true, "каких": true,
	"который": true, "которой": true, "которых": true, "которые": true,
	"должен": true, "должна": true, "должны": true,
	"иметь": true, "имеет": true,
	"нужно": true, "нужна": true, "надо": true,
	"чтобы": true, "поэтому": true, "потому": true,
	"пункт": true, "пункта": true, "пунктов": true, "пунктом": true,
	"настоящий": true, "настоящего": true, "настоящему": true, "настоящим": true,
	"стороны": true, "сторона": true, "стороной": true, "сторон": true,
	// English
	"this": true, "that": true, "with": true, "from": true,
	"have": true, "been": true, "will": true, "would": true,
	"there": true, "their": true, "which": true, "about": true,
	"other": true, "these": true, "some": true, "them": true,
	"than": true, "into": true, "over": true, "such": true,
	"after": true, "before": true, "between": true,
	"should": true, "could": true, "where": true, "when": true,
}

func isStopWord(w string) bool {
	if stopWords[w] {
		return true
	}
	// Filter out URL-like fragments and technical junk
	if isJunkWord(w) {
		return true
	}
	return false
}

func isJunkWord(w string) bool {
	// Too short latin words are usually junk
	isLatin := true
	for _, r := range w {
		if r >= 0x0400 && r <= 0x04FF { // Cyrillic range
			isLatin = false
			break
		}
	}

	// Latin words: require at least 5 chars and must contain a vowel
	if isLatin {
		if len(w) < 5 {
			return true
		}
		hasVowel := false
		for _, r := range w {
			if r == 'a' || r == 'e' || r == 'i' || r == 'o' || r == 'u' || r == 'y' {
				hasVowel = true
				break
			}
		}
		if !hasVowel {
			return true
		}
		// Common tech junk
		techJunk := map[string]bool{
			"https": true, "http": true, "www": true, "html": true, "xmlns": true,
			"color": true, "style": true, "class": true, "width": true, "height": true,
			"padding": true, "margin": true, "border": true, "display": true,
			"content": true, "serif": true, "arial": true, "helvetica": true,
			"verdana": true, "times": true, "roman": true, "false": true, "true": true,
			"undefined": true, "null": true, "function": true, "return": true,
			"const": true, "export": true, "import": true, "default": true,
		}
		if techJunk[w] {
			return true
		}
	}

	// Cyrillic: require at least 4 chars and a vowel
	if !isLatin {
		hasVowel := false
		for _, r := range w {
			if r == 'а' || r == 'е' || r == 'ё' || r == 'и' || r == 'о' || r == 'у' || r == 'ы' || r == 'э' || r == 'ю' || r == 'я' {
				hasVowel = true
				break
			}
		}
		if !hasVowel {
			return true
		}
	}

	return false
}
