package handlers

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/adv/api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RefRecordHandler struct {
	db *pgxpool.Pool
}

func NewRefRecordHandler(db *pgxpool.Pool) *RefRecordHandler {
	return &RefRecordHandler{db: db}
}

type RefRecord struct {
	ID             string          `json:"id"`
	TableID        string          `json:"table_id"`
	ObjectID       *string         `json:"object_id,omitempty"`
	ParentRecordID *string         `json:"parent_record_id,omitempty"`
	Data           json.RawMessage `json:"data"`
	RecordDate     *string         `json:"record_date,omitempty"`
	IsApproved     bool            `json:"is_approved"`
	SortOrder      int             `json:"sort_order"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	CreatedBy      *string         `json:"created_by,omitempty"`
}

// List returns records for a ref table, optionally filtered by object_id
func (h *RefRecordHandler) List(w http.ResponseWriter, r *http.Request) {
	tableID := chi.URLParam(r, "tableId")
	objectID := r.URL.Query().Get("object_id")

	query := `SELECT id, table_id, object_id, parent_record_id, data,
	                  record_date, is_approved, sort_order, created_at, updated_at, created_by
	           FROM reference_records WHERE table_id = $1`
	args := []interface{}{tableID}

	if objectID != "" {
		query += ` AND object_id = $2`
		args = append(args, objectID)
	}
	query += ` ORDER BY sort_order, created_at`

	rows, err := h.db.Query(context.Background(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var records []RefRecord
	for rows.Next() {
		var rec RefRecord
		if err := rows.Scan(&rec.ID, &rec.TableID, &rec.ObjectID, &rec.ParentRecordID,
			&rec.Data, &rec.RecordDate, &rec.IsApproved, &rec.SortOrder,
			&rec.CreatedAt, &rec.UpdatedAt, &rec.CreatedBy); err != nil {
			continue
		}
		records = append(records, rec)
	}
	if records == nil {
		records = []RefRecord{}
	}

	// Load formula columns for this table and compute values
	formulaCols := h.getFormulaColumns(tableID)
	if len(formulaCols) > 0 {
		for i := range records {
			var data map[string]interface{}
			if err := json.Unmarshal(records[i].Data, &data); err != nil {
				continue
			}
			for _, fc := range formulaCols {
				result := evaluateFormula(fc.elements, data)
				if result != nil {
					data[fc.requisiteID] = *result
				}
			}
			if newData, err := json.Marshal(data); err == nil {
				records[i].Data = newData
			}
		}
	}

	writeJSON(w, http.StatusOK, records)
}

type formulaColumn struct {
	requisiteID string
	elements    []formulaElement
}

type formulaElement struct {
	Type  string `json:"type"`
	Value string `json:"value"`
	Label string `json:"label"`
}

func (h *RefRecordHandler) getFormulaColumns(tableID string) []formulaColumn {
	rows, err := h.db.Query(context.Background(),
		`SELECT r.id, r.config
		 FROM reference_table_columns c
		 JOIN requisites r ON r.id = c.requisite_id
		 WHERE c.table_id = $1 AND r.type = 'formula'`, tableID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var result []formulaColumn
	for rows.Next() {
		var reqID string
		var configJSON json.RawMessage
		if err := rows.Scan(&reqID, &configJSON); err != nil {
			continue
		}
		var config struct {
			Elements []formulaElement `json:"elements"`
		}
		if err := json.Unmarshal(configJSON, &config); err != nil || len(config.Elements) == 0 {
			continue
		}
		result = append(result, formulaColumn{requisiteID: reqID, elements: config.Elements})
	}
	return result
}

func evaluateFormula(elements []formulaElement, data map[string]interface{}) *float64 {
	// Build list of tokens: numbers and operators
	var tokens []interface{} // float64 or string (operator/paren)

	for _, el := range elements {
		switch el.Type {
		case "operator":
			tokens = append(tokens, el.Value)
		case "paren":
			tokens = append(tokens, el.Value)
		case "constant":
			num, err := strconv.ParseFloat(el.Value, 64)
			if err != nil {
				return nil
			}
			tokens = append(tokens, num)
		case "requisite":
			val, ok := data[el.Value]
			if !ok {
				return nil
			}
			num, err := toFloat(val)
			if err != nil {
				return nil
			}
			tokens = append(tokens, num)
		}
	}

	result := evalTokens(tokens)
	if result == nil || math.IsNaN(*result) || math.IsInf(*result, 0) {
		return nil
	}
	// Round to 2 decimal places
	rounded := math.Round(*result*100) / 100
	return &rounded
}

func toFloat(v interface{}) (float64, error) {
	switch val := v.(type) {
	case float64:
		return val, nil
	case int:
		return float64(val), nil
	case string:
		return strconv.ParseFloat(val, 64)
	case json.Number:
		return val.Float64()
	default:
		return 0, strconv.ErrSyntax
	}
}

// Simple recursive descent parser for: expr = term ((+|-) term)*
// term = factor ((*|/) factor)*
// factor = number | '(' expr ')'
func evalTokens(tokens []interface{}) *float64 {
	pos := 0
	result := parseExpr(tokens, &pos)
	return result
}

func parseExpr(tokens []interface{}, pos *int) *float64 {
	left := parseTerm(tokens, pos)
	if left == nil {
		return nil
	}
	for *pos < len(tokens) {
		op, ok := tokens[*pos].(string)
		if !ok || (op != "+" && op != "-") {
			break
		}
		*pos++
		right := parseTerm(tokens, pos)
		if right == nil {
			return nil
		}
		if op == "+" {
			val := *left + *right
			left = &val
		} else {
			val := *left - *right
			left = &val
		}
	}
	return left
}

func parseTerm(tokens []interface{}, pos *int) *float64 {
	left := parseFactor(tokens, pos)
	if left == nil {
		return nil
	}
	for *pos < len(tokens) {
		op, ok := tokens[*pos].(string)
		if !ok || (op != "*" && op != "/") {
			break
		}
		*pos++
		right := parseFactor(tokens, pos)
		if right == nil {
			return nil
		}
		if op == "*" {
			val := *left * *right
			left = &val
		} else {
			if *right == 0 {
				return nil // division by zero
			}
			val := *left / *right
			left = &val
		}
	}
	return left
}

func parseFactor(tokens []interface{}, pos *int) *float64 {
	if *pos >= len(tokens) {
		return nil
	}
	// Number
	if num, ok := tokens[*pos].(float64); ok {
		*pos++
		return &num
	}
	// Parenthesized expression
	if s, ok := tokens[*pos].(string); ok && s == "(" {
		*pos++
		result := parseExpr(tokens, pos)
		if result == nil {
			return nil
		}
		if *pos < len(tokens) {
			if cp, ok := tokens[*pos].(string); ok && cp == ")" {
				*pos++
			}
		}
		return result
	}
	return nil
}

// Create adds a new record
func (h *RefRecordHandler) Create(w http.ResponseWriter, r *http.Request) {
	tableID := chi.URLParam(r, "tableId")

	var req struct {
		ObjectID       *string         `json:"object_id"`
		ParentRecordID *string         `json:"parent_record_id"`
		Data           json.RawMessage `json:"data"`
		RecordDate     *string         `json:"record_date"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Data == nil {
		req.Data = []byte("{}")
	}

	userID := middleware.GetUserID(r.Context())
	var userIDPtr *string
	if userID != "" {
		userIDPtr = &userID
	}

	var rec RefRecord
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO reference_records (table_id, object_id, parent_record_id, data, record_date, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, table_id, object_id, parent_record_id, data,
		           record_date, is_approved, sort_order, created_at, updated_at, created_by`,
		tableID, req.ObjectID, req.ParentRecordID, req.Data, req.RecordDate, userIDPtr,
	).Scan(&rec.ID, &rec.TableID, &rec.ObjectID, &rec.ParentRecordID,
		&rec.Data, &rec.RecordDate, &rec.IsApproved, &rec.SortOrder,
		&rec.CreatedAt, &rec.UpdatedAt, &rec.CreatedBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create record failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, rec)
}

// Update modifies a record
func (h *RefRecordHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "recordId")

	var req struct {
		Data       json.RawMessage `json:"data"`
		RecordDate *string         `json:"record_date"`
		IsApproved *bool           `json:"is_approved"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Data == nil {
		req.Data = []byte("{}")
	}

	var rec RefRecord
	err := h.db.QueryRow(context.Background(),
		`UPDATE reference_records SET
			data = $1, record_date = COALESCE($2, record_date),
			is_approved = COALESCE($3, is_approved), updated_at = NOW()
		 WHERE id = $4
		 RETURNING id, table_id, object_id, parent_record_id, data,
		           record_date, is_approved, sort_order, created_at, updated_at, created_by`,
		req.Data, req.RecordDate, req.IsApproved, id,
	).Scan(&rec.ID, &rec.TableID, &rec.ObjectID, &rec.ParentRecordID,
		&rec.Data, &rec.RecordDate, &rec.IsApproved, &rec.SortOrder,
		&rec.CreatedAt, &rec.UpdatedAt, &rec.CreatedBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update record failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

// Delete removes a record
func (h *RefRecordHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "recordId")
	h.db.Exec(context.Background(), `DELETE FROM reference_records WHERE id = $1`, id)
	w.WriteHeader(http.StatusNoContent)
}
