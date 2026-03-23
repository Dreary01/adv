package handlers

import (
	"context"
	"encoding/json"
	"fmt"
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

// Aggregations computes aggregated values for each column with aggregation set
func (h *RefRecordHandler) Aggregations(w http.ResponseWriter, r *http.Request) {
	tableID := chi.URLParam(r, "tableId")
	objectID := r.URL.Query().Get("object_id")

	// Get columns with aggregation set
	colRows, err := h.db.Query(context.Background(),
		`SELECT c.requisite_id, c.aggregation, r.type
		 FROM reference_table_columns c
		 JOIN requisites r ON r.id = c.requisite_id
		 WHERE c.table_id = $1 AND c.aggregation != ''`, tableID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{})
		return
	}
	defer colRows.Close()

	type aggCol struct {
		requisiteID string
		aggregation string
		reqType     string
	}
	var aggCols []aggCol
	for colRows.Next() {
		var ac aggCol
		if err := colRows.Scan(&ac.requisiteID, &ac.aggregation, &ac.reqType); err != nil {
			continue
		}
		aggCols = append(aggCols, ac)
	}
	if len(aggCols) == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{})
		return
	}

	// Load records
	query := `SELECT data FROM reference_records WHERE table_id = $1`
	args := []interface{}{tableID}
	if objectID != "" {
		query += ` AND object_id = $2`
		args = append(args, objectID)
	}
	rows, err := h.db.Query(context.Background(), query, args...)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{})
		return
	}
	defer rows.Close()

	// Load formula columns to compute formula values before aggregation
	formulaCols := h.getFormulaColumns(tableID)

	// Collect all values per requisite
	valuesMap := make(map[string][]interface{}) // requisiteID -> values
	totalRecords := 0
	for rows.Next() {
		var dataJSON json.RawMessage
		if err := rows.Scan(&dataJSON); err != nil {
			continue
		}
		var data map[string]interface{}
		if err := json.Unmarshal(dataJSON, &data); err != nil {
			continue
		}
		// Compute formula values for this record
		for _, fc := range formulaCols {
			result := evaluateFormula(fc.elements, data)
			if result != nil {
				data[fc.requisiteID] = *result
			}
		}
		totalRecords++
		for _, ac := range aggCols {
			val, exists := data[ac.requisiteID]
			if !exists || val == nil || val == "" {
				valuesMap[ac.requisiteID] = append(valuesMap[ac.requisiteID], nil)
			} else {
				valuesMap[ac.requisiteID] = append(valuesMap[ac.requisiteID], val)
			}
		}
	}

	// Compute aggregations
	result := make(map[string]interface{})
	for _, ac := range aggCols {
		vals := valuesMap[ac.requisiteID]
		result[ac.requisiteID] = computeAggregation(ac.aggregation, vals, totalRecords)
	}

	writeJSON(w, http.StatusOK, result)
}

func computeAggregation(aggType string, values []interface{}, totalRecords int) interface{} {
	// Separate empty vs filled values (works for any type)
	var filledVals []interface{}
	nullCount := 0
	for _, v := range values {
		if v == nil {
			nullCount++
			continue
		}
		// Treat empty strings as null
		if s, ok := v.(string); ok && s == "" {
			nullCount++
			continue
		}
		filledVals = append(filledVals, v)
	}
	filledCount := len(filledVals)

	// Universal aggregations (work with any type)
	switch aggType {
	case "count_empty":
		return nullCount
	case "count_filled":
		return filledCount
	case "count_unique":
		unique := make(map[string]bool)
		for _, v := range filledVals {
			unique[fmt.Sprintf("%v", v)] = true
		}
		return len(unique)
	case "pct_empty":
		if totalRecords == 0 {
			return 0
		}
		return math.Round(float64(nullCount)/float64(totalRecords)*10000) / 100
	case "pct_filled":
		if totalRecords == 0 {
			return 0
		}
		return math.Round(float64(filledCount)/float64(totalRecords)*10000) / 100
	case "pct_unique":
		if filledCount == 0 {
			return 0
		}
		unique := make(map[string]bool)
		for _, v := range filledVals {
			unique[fmt.Sprintf("%v", v)] = true
		}
		return math.Round(float64(len(unique))/float64(filledCount)*10000) / 100
	}

	// Numeric-only aggregations
	var nums []float64
	for _, v := range filledVals {
		f, err := toFloat(v)
		if err != nil {
			continue
		}
		nums = append(nums, f)
	}

	switch aggType {
	case "sum":
		if len(nums) == 0 {
			return 0
		}
		sum := 0.0
		for _, n := range nums {
			sum += n
		}
		return math.Round(sum*100) / 100
	case "min":
		if len(nums) == 0 {
			return nil
		}
		min := nums[0]
		for _, n := range nums[1:] {
			if n < min {
				min = n
			}
		}
		return min
	case "max":
		if len(nums) == 0 {
			return nil
		}
		max := nums[0]
		for _, n := range nums[1:] {
			if n > max {
				max = n
			}
		}
		return max
	case "avg":
		if len(nums) == 0 {
			return nil
		}
		sum := 0.0
		for _, n := range nums {
			sum += n
		}
		return math.Round(sum/float64(len(nums))*100) / 100
	case "median":
		if len(nums) == 0 {
			return nil
		}
		sorted := make([]float64, len(nums))
		copy(sorted, nums)
		sortFloats(sorted)
		mid := len(sorted) / 2
		if len(sorted)%2 == 0 {
			return math.Round((sorted[mid-1]+sorted[mid])/2*100) / 100
		}
		return sorted[mid]
	default:
		return nil
	}
}

func sortFloats(a []float64) {
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j] < a[j-1]; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
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
