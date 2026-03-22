package handlers

import (
	"context"
	"net/http"

	"github.com/adv/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RefTableHandler struct {
	db *pgxpool.Pool
}

func NewRefTableHandler(db *pgxpool.Pool) *RefTableHandler {
	return &RefTableHandler{db: db}
}

func (h *RefTableHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(context.Background(),
		`SELECT id, name, description, icon, structure, input_mode,
		        show_on_main_page, use_date, date_auto_fill, has_approval, created_at
		 FROM reference_tables ORDER BY name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var tables []models.ReferenceTable
	for rows.Next() {
		var t models.ReferenceTable
		rows.Scan(&t.ID, &t.Name, &t.Description, &t.Icon, &t.Structure, &t.InputMode,
			&t.ShowOnMainPage, &t.UseDate, &t.DateAutoFill, &t.HasApproval, &t.CreatedAt)
		tables = append(tables, t)
	}
	if tables == nil {
		tables = []models.ReferenceTable{}
	}
	writeJSONList(w, tables, len(tables))
}

func (h *RefTableHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var t models.ReferenceTable
	err := h.db.QueryRow(context.Background(),
		`SELECT id, name, description, icon, structure, input_mode,
		        show_on_main_page, use_date, date_auto_fill, has_approval, created_at
		 FROM reference_tables WHERE id = $1`, id,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Icon, &t.Structure, &t.InputMode,
		&t.ShowOnMainPage, &t.UseDate, &t.DateAutoFill, &t.HasApproval, &t.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "reference table not found")
		return
	}

	colRows, _ := h.db.Query(context.Background(),
		`SELECT c.id, c.table_id, c.requisite_id, c.sort_order, c.is_visible,
		        r.id, r.name, r.description, r.type, r.config, r.is_unique
		 FROM reference_table_columns c
		 JOIN requisites r ON r.id = c.requisite_id
		 WHERE c.table_id = $1 ORDER BY c.sort_order`, id)
	if colRows != nil {
		defer colRows.Close()
		for colRows.Next() {
			var col models.RefTableColumn
			var req models.Requisite
			colRows.Scan(&col.ID, &col.TableID, &col.RequisiteID, &col.SortOrder, &col.IsVisible,
				&req.ID, &req.Name, &req.Description, &req.Type, &req.Config, &req.IsUnique)
			col.Requisite = &req
			t.Columns = append(t.Columns, col)
		}
	}

	writeJSON(w, http.StatusOK, t)
}

func (h *RefTableHandler) Create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name           string  `json:"name"`
		Description    *string `json:"description"`
		Structure      string  `json:"structure"`
		InputMode      string  `json:"input_mode"`
		ShowOnMainPage bool    `json:"show_on_main_page"`
		UseDate        bool    `json:"use_date"`
		HasApproval    bool    `json:"has_approval"`
	}
	if err := decodeJSON(r, &input); err != nil || input.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if input.Structure == "" {
		input.Structure = "flat"
	}
	if input.InputMode == "" {
		input.InputMode = "inline"
	}

	var t models.ReferenceTable
	h.db.QueryRow(context.Background(),
		`INSERT INTO reference_tables (name, description, structure, input_mode, show_on_main_page, use_date, has_approval)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, name, description, icon, structure, input_mode, show_on_main_page, use_date, date_auto_fill, has_approval, created_at`,
		input.Name, input.Description, input.Structure, input.InputMode,
		input.ShowOnMainPage, input.UseDate, input.HasApproval,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Icon, &t.Structure, &t.InputMode,
		&t.ShowOnMainPage, &t.UseDate, &t.DateAutoFill, &t.HasApproval, &t.CreatedAt)

	writeJSON(w, http.StatusCreated, t)
}

func (h *RefTableHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var input struct {
		Name           string  `json:"name"`
		Description    *string `json:"description"`
		Structure      string  `json:"structure"`
		InputMode      string  `json:"input_mode"`
		ShowOnMainPage bool    `json:"show_on_main_page"`
		UseDate        bool    `json:"use_date"`
		HasApproval    bool    `json:"has_approval"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	var t models.ReferenceTable
	err := h.db.QueryRow(context.Background(),
		`UPDATE reference_tables SET
			name = COALESCE(NULLIF($1, ''), name),
			description = $2, structure = COALESCE(NULLIF($3::text, '')::ref_table_structure, structure),
			input_mode = COALESCE(NULLIF($4::text, '')::ref_table_input_mode, input_mode),
			show_on_main_page = $5, use_date = $6, has_approval = $7
		 WHERE id = $8
		 RETURNING id, name, description, icon, structure, input_mode, show_on_main_page, use_date, date_auto_fill, has_approval, created_at`,
		input.Name, input.Description, input.Structure, input.InputMode,
		input.ShowOnMainPage, input.UseDate, input.HasApproval, id,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Icon, &t.Structure, &t.InputMode,
		&t.ShowOnMainPage, &t.UseDate, &t.DateAutoFill, &t.HasApproval, &t.CreatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *RefTableHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.db.Exec(context.Background(), `DELETE FROM reference_tables WHERE id = $1`, id)
	w.WriteHeader(http.StatusNoContent)
}

func (h *RefTableHandler) AddColumn(w http.ResponseWriter, r *http.Request) {
	tableID := chi.URLParam(r, "id")
	var input struct {
		RequisiteID string `json:"requisite_id"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := decodeJSON(r, &input); err != nil || input.RequisiteID == "" {
		writeError(w, http.StatusBadRequest, "requisite_id is required")
		return
	}
	var col models.RefTableColumn
	h.db.QueryRow(context.Background(),
		`INSERT INTO reference_table_columns (table_id, requisite_id, sort_order)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (table_id, requisite_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
		 RETURNING id, table_id, requisite_id, sort_order, is_visible`,
		tableID, input.RequisiteID, input.SortOrder,
	).Scan(&col.ID, &col.TableID, &col.RequisiteID, &col.SortOrder, &col.IsVisible)
	writeJSON(w, http.StatusCreated, col)
}

func (h *RefTableHandler) DeleteColumn(w http.ResponseWriter, r *http.Request) {
	colID := chi.URLParam(r, "colId")
	h.db.Exec(context.Background(), `DELETE FROM reference_table_columns WHERE id = $1`, colID)
	w.WriteHeader(http.StatusNoContent)
}
