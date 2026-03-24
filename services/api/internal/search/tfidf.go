package search

import (
	"math"
	"strings"
)

// DocVector represents a document's TF-IDF vector
type DocVector struct {
	ID     string
	Vector map[string]float64
}

// SearchResult represents a single search hit
type SearchResult struct {
	ID    string
	Score float64
}

// ComputeTF computes weighted term frequency for text
func ComputeTF(text string) map[string]float64 {
	tokens := Tokenize(text)
	if len(tokens) == 0 {
		return nil
	}

	// Count occurrences
	counts := make(map[string]int, len(tokens))
	for _, t := range tokens {
		counts[t]++
	}

	total := float64(len(tokens))
	tf := make(map[string]float64, len(counts))
	for token, count := range counts {
		base := float64(count) / total
		// Weight by token type
		var weight float64
		switch {
		case strings.HasPrefix(token, "~"): // trigram
			weight = 0.3
		case strings.HasPrefix(token, "=") || strings.HasPrefix(token, "-"): // fuzzy
			weight = 0.5
		default: // word token
			weight = 1.0
		}
		tf[token] = base * weight
	}
	return tf
}

// Search performs TF-IDF cosine similarity search
func TFIDFSearch(query string, documents []DocVector, topK int) []SearchResult {
	if len(documents) == 0 {
		return nil
	}

	// Compute query TF
	queryTF := ComputeTF(query)
	if len(queryTF) == 0 {
		return nil
	}

	docCount := float64(len(documents))

	// Compute document frequency (DF) for each token
	df := make(map[string]int, len(queryTF))
	for token := range queryTF {
		for _, doc := range documents {
			if _, exists := doc.Vector[token]; exists {
				df[token]++
			}
		}
	}

	// Compute IDF
	idf := make(map[string]float64, len(df))
	for token, freq := range df {
		idf[token] = math.Log((docCount+1)/float64(freq+1)) + 1
	}

	// Build query vector (TF * IDF)
	queryVec := make(map[string]float64, len(queryTF))
	for token, tfVal := range queryTF {
		if idfVal, ok := idf[token]; ok {
			queryVec[token] = tfVal * idfVal
		}
	}

	// Score each document
	var results []SearchResult
	for _, doc := range documents {
		// Build doc vector (TF * IDF) — only for query tokens
		docVec := make(map[string]float64, len(queryVec))
		for token := range queryVec {
			if tfVal, ok := doc.Vector[token]; ok {
				docVec[token] = tfVal * idf[token]
			}
		}

		score := cosineSim(queryVec, docVec)
		if score > 0.005 {
			results = append(results, SearchResult{ID: doc.ID, Score: score})
		}
	}

	// Sort by score descending
	sortResults(results)

	if len(results) > topK {
		results = results[:topK]
	}
	return results
}

func cosineSim(a, b map[string]float64) float64 {
	var dot, normA, normB float64

	for k, va := range a {
		normA += va * va
		if vb, ok := b[k]; ok {
			dot += va * vb
		}
	}
	for _, vb := range b {
		normB += vb * vb
	}

	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

func sortResults(results []SearchResult) {
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && results[j].Score > results[j-1].Score; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}
}
