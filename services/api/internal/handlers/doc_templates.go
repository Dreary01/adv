package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"time"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/storage"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DocTemplateHandler struct {
	db         *pgxpool.Pool
	storage    storage.Storage
	carboneURL string
}

func NewDocTemplateHandler(db *pgxpool.Pool, store storage.Storage, carboneURL string) *DocTemplateHandler {
	return &DocTemplateHandler{db: db, storage: store, carboneURL: carboneURL}
}

type docTemplate struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	ObjectTypeID      *string   `json:"object_type_id,omitempty"`
	ObjectTypeName    *string   `json:"object_type_name,omitempty"`
	CarboneTemplateID *string   `json:"carbone_template_id,omitempty"`
	FilePath          *string   `json:"file_path,omitempty"`
	CreatedBy         *string   `json:"created_by,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// List — GET /api/document-templates?type_id=...
func (h *DocTemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	typeID := r.URL.Query().Get("type_id")

	query := `SELECT dt.id, dt.name, dt.object_type_id, ot.name, dt.carbone_template_id,
	                 dt.file_path, dt.created_by, dt.created_at, dt.updated_at
	          FROM document_templates dt
	          LEFT JOIN object_types ot ON ot.id = dt.object_type_id
	          WHERE dt.workspace_id = $1`
	args := []interface{}{wsID}
	if typeID != "" {
		query += ` AND dt.object_type_id = $2`
		args = append(args, typeID)
	}
	query += ` ORDER BY dt.created_at DESC`

	rows, err := h.db.Query(context.Background(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var list []docTemplate
	for rows.Next() {
		var t docTemplate
		if err := rows.Scan(&t.ID, &t.Name, &t.ObjectTypeID, &t.ObjectTypeName,
			&t.CarboneTemplateID, &t.FilePath, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		list = append(list, t)
	}
	if list == nil {
		list = []docTemplate{}
	}
	writeJSONList(w, list, len(list))
}

// Get — GET /api/document-templates/{id}
func (h *DocTemplateHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var t docTemplate
	err := h.db.QueryRow(context.Background(),
		`SELECT dt.id, dt.name, dt.object_type_id, ot.name, dt.carbone_template_id,
		        dt.file_path, dt.created_by, dt.created_at, dt.updated_at
		 FROM document_templates dt
		 LEFT JOIN object_types ot ON ot.id = dt.object_type_id
		 WHERE dt.id = $1 AND dt.workspace_id = $2`, id, wsID,
	).Scan(&t.ID, &t.Name, &t.ObjectTypeID, &t.ObjectTypeName,
		&t.CarboneTemplateID, &t.FilePath, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// Create — POST /api/document-templates
// Multipart form: file (docx), name, object_type_id
func (h *DocTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()

	name := r.FormValue("name")
	if name == "" {
		name = header.Filename
	}
	objectTypeID := r.FormValue("object_type_id")

	// Save file to local storage
	storagePath := filepath.Join("templates", wsID, header.Filename)
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}
	if err := h.storage.Save(r.Context(), storagePath, bytes.NewReader(fileBytes)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	// Upload template to Carbone
	carboneID, err := h.uploadToCarbone(fileBytes, header.Filename)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("carbone upload failed: %v", err))
		return
	}

	// Insert into DB
	var id string
	var objTypePtr *string
	if objectTypeID != "" {
		objTypePtr = &objectTypeID
	}
	err = h.db.QueryRow(context.Background(),
		`INSERT INTO document_templates (workspace_id, name, object_type_id, carbone_template_id, file_path, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		wsID, name, objTypePtr, carboneID, storagePath, userID,
	).Scan(&id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "carbone_template_id": carboneID})
}

// Delete — DELETE /api/document-templates/{id}
func (h *DocTemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var filePath *string
	var carboneID *string
	err := h.db.QueryRow(context.Background(),
		`DELETE FROM document_templates WHERE id = $1 AND workspace_id = $2 RETURNING file_path, carbone_template_id`,
		id, wsID).Scan(&filePath, &carboneID)
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}

	// Cleanup: delete from storage
	if filePath != nil {
		_ = h.storage.Delete(r.Context(), *filePath)
	}
	// Cleanup: delete from Carbone
	if carboneID != nil && *carboneID != "" {
		h.deleteFromCarbone(*carboneID)
	}

	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

// StudioConfig — GET /api/document-templates/{id}/studio-config
// Returns config needed to open template in Carbone Studio
func (h *DocTemplateHandler) StudioConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var carboneID *string
	var objectTypeID *string
	err := h.db.QueryRow(context.Background(),
		`SELECT carbone_template_id, object_type_id FROM document_templates WHERE id = $1 AND workspace_id = $2`,
		id, wsID).Scan(&carboneID, &objectTypeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}

	// Build sample data for Studio preview
	sampleData := h.buildSampleData(objectTypeID, wsID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"carbone_url":         h.carboneURL,
		"carbone_template_id": carboneID,
		"sample_data":         sampleData,
	})
}

// Generate — POST /api/objects/{id}/generate/{templateId}?format=pdf
func (h *DocTemplateHandler) Generate(w http.ResponseWriter, r *http.Request) {
	objectID := chi.URLParam(r, "id")
	templateID := chi.URLParam(r, "templateId")
	format := r.URL.Query().Get("format") // pdf or docx (empty = original)
	wsID := middleware.GetWorkspaceID(r.Context())

	// 1. Load template
	var carboneID string
	err := h.db.QueryRow(context.Background(),
		`SELECT carbone_template_id FROM document_templates WHERE id = $1 AND workspace_id = $2`,
		templateID, wsID).Scan(&carboneID)
	if err != nil {
		writeError(w, http.StatusNotFound, "template not found")
		return
	}

	// 2. Build data JSON from object + requisites
	data, objectName, err := h.buildObjectData(objectID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to build data: %v", err))
		return
	}

	// 3. Render via Carbone
	fileBytes, contentType, err := h.renderDocument(carboneID, data, format)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("carbone render failed: %v", err))
		return
	}

	// 4. Return file
	ext := "docx"
	if format == "pdf" {
		ext = "pdf"
	}
	filename := fmt.Sprintf("%s.%s", objectName, ext)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Write(fileBytes)
}

// --- Carbone API helpers ---

func (h *DocTemplateHandler) uploadToCarbone(fileBytes []byte, filename string) (string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("template", filename)
	if err != nil {
		return "", err
	}
	part.Write(fileBytes)
	writer.Close()

	req, _ := http.NewRequest("POST", h.carboneURL+"/template", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("carbone request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
		Data    struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("carbone response parse failed: %w", err)
	}
	if !result.Success {
		return "", fmt.Errorf("carbone returned success=false")
	}
	return result.Data.ID, nil
}

func (h *DocTemplateHandler) deleteFromCarbone(templateID string) {
	req, _ := http.NewRequest("DELETE", h.carboneURL+"/template/"+templateID, nil)
	http.DefaultClient.Do(req)
}

func (h *DocTemplateHandler) renderDocument(carboneTemplateID string, data map[string]interface{}, convertTo string) ([]byte, string, error) {
	payload := map[string]interface{}{
		"data": data,
	}
	if convertTo == "pdf" {
		payload["convertTo"] = "pdf"
	}

	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/render/%s?download=true", h.carboneURL, carboneTemplateID)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("carbone render request failed: %w", err)
	}
	defer resp.Body.Close()

	// With ?download=true, Carbone returns the file directly
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, "", fmt.Errorf("carbone render failed (%d): %s", resp.StatusCode, string(errBody))
	}

	fileBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		if convertTo == "pdf" {
			contentType = "application/pdf"
		} else {
			contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		}
	}

	return fileBytes, contentType, nil
}

// --- Data assembly ---

// buildObjectData loads object + requisites and builds a flat JSON map for Carbone
func (h *DocTemplateHandler) buildObjectData(objectID, wsID string) (map[string]interface{}, string, error) {
	// Load object
	var name, status, typeID string
	var code, description, ownerName, assigneeName, planStart, planEnd, actualStart, actualEnd *string
	var fieldValues json.RawMessage
	var createdAt time.Time

	err := h.db.QueryRow(context.Background(),
		`SELECT o.name, COALESCE(o.code, ''), o.status, o.type_id, o.description,
		        o.field_values, o.created_at,
		        uo.first_name || ' ' || uo.last_name,
		        ua.first_name || ' ' || ua.last_name,
		        p.start_date::text, p.end_date::text,
		        o.actual_start_date::text, o.actual_end_date::text
		 FROM objects o
		 LEFT JOIN users uo ON uo.id = o.owner_id
		 LEFT JOIN users ua ON ua.id = o.assignee_id
		 LEFT JOIN object_plans p ON p.object_id = o.id AND p.plan_type = 'operational'
		 WHERE o.id = $1 AND o.workspace_id = $2`, objectID, wsID,
	).Scan(&name, &code, &status, &typeID, &description,
		&fieldValues, &createdAt,
		&ownerName, &assigneeName,
		&planStart, &planEnd, &actualStart, &actualEnd)
	if err != nil {
		return nil, "", fmt.Errorf("object not found: %w", err)
	}

	// Load type name
	var typeName string
	h.db.QueryRow(context.Background(),
		`SELECT name FROM object_types WHERE id = $1`, typeID).Scan(&typeName)

	data := map[string]interface{}{
		"name":         name,
		"code":         code,
		"status":       status,
		"type":         typeName,
		"description":  ptrOr(description, ""),
		"owner":        ptrOr(ownerName, ""),
		"assignee":     ptrOr(assigneeName, ""),
		"plan_start":   ptrOr(planStart, ""),
		"plan_end":     ptrOr(planEnd, ""),
		"actual_start": ptrOr(actualStart, ""),
		"actual_end":   ptrOr(actualEnd, ""),
		"created_at":   createdAt.Format("02.01.2006"),
		"today":        time.Now().Format("02.01.2006"),
	}

	// Load requisites for this object type and resolve field_values
	reqMap, err := h.resolveRequisites(typeID, fieldValues, wsID)
	if err == nil {
		data["req"] = reqMap
	}

	return data, name, nil
}

// resolveRequisites maps requisite IDs from field_values to named values
func (h *DocTemplateHandler) resolveRequisites(typeID string, fieldValues json.RawMessage, wsID string) (map[string]interface{}, error) {
	// Parse field_values: { "requisiteID": value, ... }
	var fv map[string]interface{}
	if err := json.Unmarshal(fieldValues, &fv); err != nil {
		return nil, err
	}

	// Load requisite names for this object type
	rows, err := h.db.Query(context.Background(),
		`SELECT r.id, r.name, r.type
		 FROM object_type_requisites otr
		 JOIN requisites r ON r.id = otr.requisite_id
		 WHERE otr.object_type_id = $1`, typeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type reqInfo struct {
		Name string
		Type string
	}
	reqNames := map[string]reqInfo{}
	for rows.Next() {
		var id, name, rtype string
		rows.Scan(&id, &name, &rtype)
		reqNames[id] = reqInfo{Name: name, Type: rtype}
	}

	result := map[string]interface{}{}
	for reqID, val := range fv {
		info, ok := reqNames[reqID]
		if !ok {
			continue
		}
		// For classifier type, resolve the value name
		if info.Type == "classifier" {
			if strVal, ok := val.(string); ok && strVal != "" {
				var cvName string
				err := h.db.QueryRow(context.Background(),
					`SELECT name FROM classifier_values WHERE id = $1`, strVal).Scan(&cvName)
				if err == nil {
					val = cvName
				}
			}
		}
		result[info.Name] = val
	}

	return result, nil
}

// buildSampleData creates example data for Carbone Studio preview
func (h *DocTemplateHandler) buildSampleData(objectTypeID *string, wsID string) map[string]interface{} {
	data := map[string]interface{}{
		"name":         "Пример объекта",
		"code":         "OBJ-001",
		"status":       "active",
		"type":         "Проект",
		"description":  "Описание объекта",
		"owner":        "Иванов Иван",
		"assignee":     "Петров Пётр",
		"plan_start":   "01.04.2026",
		"plan_end":     "30.06.2026",
		"actual_start": "",
		"actual_end":   "",
		"created_at":   time.Now().Format("02.01.2006"),
		"today":        time.Now().Format("02.01.2006"),
	}

	if objectTypeID == nil {
		data["req"] = map[string]interface{}{}
		return data
	}

	// Load requisite names for preview
	rows, _ := h.db.Query(context.Background(),
		`SELECT r.name, r.type
		 FROM object_type_requisites otr
		 JOIN requisites r ON r.id = otr.requisite_id
		 WHERE otr.object_type_id = $1
		 ORDER BY otr.sort_order`, *objectTypeID)
	reqMap := map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var name, rtype string
			rows.Scan(&name, &rtype)
			switch rtype {
			case "number":
				reqMap[name] = 100
			case "date":
				reqMap[name] = "01.01.2026"
			case "boolean":
				reqMap[name] = true
			default:
				reqMap[name] = "Значение " + name
			}
		}
	}
	data["req"] = reqMap
	return data
}

func ptrOr(s *string, fallback string) string {
	if s != nil {
		return *s
	}
	return fallback
}
