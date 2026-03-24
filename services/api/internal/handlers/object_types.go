package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ObjectTypeHandler struct {
	db *pgxpool.Pool
}

func NewObjectTypeHandler(db *pgxpool.Pool) *ObjectTypeHandler {
	return &ObjectTypeHandler{db: db}
}

func (h *ObjectTypeHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT id, name, description, kind, icon, color, can_be_root,
		        default_duration_days, auto_fill_effort, add_to_calendar,
		        check_uniqueness, sort_order, created_at, updated_at
		 FROM object_types WHERE workspace_id = $1 ORDER BY sort_order, name`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var types []models.ObjectType
	for rows.Next() {
		var t models.ObjectType
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Kind, &t.Icon, &t.Color,
			&t.CanBeRoot, &t.DefaultDuration, &t.AutoFillEffort, &t.AddToCalendar,
			&t.CheckUniqueness, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		types = append(types, t)
	}

	if types == nil {
		types = []models.ObjectType{}
	}
	total := len(types)
	writeJSONList(w, types, total)
}

func (h *ObjectTypeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var t models.ObjectType
	err := h.db.QueryRow(context.Background(),
		`SELECT id, name, description, kind, icon, color, can_be_root,
		        default_duration_days, auto_fill_effort, add_to_calendar,
		        check_uniqueness, sort_order, created_at, updated_at
		 FROM object_types WHERE id = $1 AND workspace_id = $2`, id, wsID,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Kind, &t.Icon, &t.Color,
		&t.CanBeRoot, &t.DefaultDuration, &t.AutoFillEffort, &t.AddToCalendar,
		&t.CheckUniqueness, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "object type not found")
		return
	}

	// load requisites
	reqRows, err := h.db.Query(context.Background(),
		`SELECT otr.id, otr.object_type_id, otr.requisite_id,
		        otr.is_required, otr.is_visible, otr.is_lockable,
		        otr.auto_sum, otr.auto_avg, otr.inherit_to_children,
		        otr.is_olap_dimension, otr.sort_order,
		        otr.is_conditional, otr.condition_requisite_id, otr.condition_value,
		        r.id, r.name, r.description, r.type, r.group_id, r.config, r.is_unique
		 FROM object_type_requisites otr
		 JOIN requisites r ON r.id = otr.requisite_id
		 WHERE otr.object_type_id = $1 AND otr.workspace_id = $2
		 ORDER BY otr.sort_order`, id, wsID)
	if err == nil {
		defer reqRows.Close()
		for reqRows.Next() {
			var otr models.ObjectTypeRequisite
			var req models.Requisite
			if err := reqRows.Scan(
				&otr.ID, &otr.ObjectTypeID, &otr.RequisiteID,
				&otr.IsRequired, &otr.IsVisible, &otr.IsLockable,
				&otr.AutoSum, &otr.AutoAvg, &otr.InheritToChildren,
				&otr.IsOlapDimension, &otr.SortOrder,
				&otr.IsConditional, &otr.ConditionReqID, &otr.ConditionValue,
				&req.ID, &req.Name, &req.Description, &req.Type, &req.GroupID, &req.Config, &req.IsUnique,
			); err == nil {
				otr.Requisite = &req
				t.Requisites = append(t.Requisites, otr)
			}
		}
	}

	// load child types
	childRows, _ := h.db.Query(context.Background(),
		`SELECT child_type_id FROM object_type_hierarchy WHERE parent_type_id = $1 AND workspace_id = $2`, id, wsID)
	if childRows != nil {
		defer childRows.Close()
		for childRows.Next() {
			var childID string
			if childRows.Scan(&childID) == nil {
				t.ChildTypes = append(t.ChildTypes, childID)
			}
		}
	}

	// load parent types
	parentRows, _ := h.db.Query(context.Background(),
		`SELECT parent_type_id FROM object_type_hierarchy WHERE child_type_id = $1 AND workspace_id = $2`, id, wsID)
	if parentRows != nil {
		defer parentRows.Close()
		for parentRows.Next() {
			var parentID string
			if parentRows.Scan(&parentID) == nil {
				t.ParentTypes = append(t.ParentTypes, parentID)
			}
		}
	}

	// load ref tables
	refRows, _ := h.db.Query(context.Background(),
		`SELECT ref_table_id FROM object_type_ref_tables WHERE object_type_id = $1 AND workspace_id = $2 ORDER BY sort_order`, id, wsID)
	if refRows != nil {
		defer refRows.Close()
		for refRows.Next() {
			var refID string
			if refRows.Scan(&refID) == nil {
				t.RefTables = append(t.RefTables, refID)
			}
		}
	}

	writeJSON(w, http.StatusOK, t)
}

func (h *ObjectTypeHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	var req models.CreateObjectTypeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Kind == "" {
		req.Kind = "task"
	}

	userID := middleware.GetUserID(r.Context())

	var t models.ObjectType
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO object_types (workspace_id, name, description, kind, icon, color, can_be_root,
		                           default_duration_days, auto_fill_effort, add_to_calendar,
		                           check_uniqueness, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, name, description, kind, icon, color, can_be_root,
		           default_duration_days, auto_fill_effort, add_to_calendar,
		           check_uniqueness, sort_order, created_at, updated_at`,
		wsID, req.Name, req.Description, req.Kind, req.Icon, req.Color, req.CanBeRoot,
		req.DefaultDuration, req.AutoFillEffort, req.AddToCalendar,
		req.CheckUniqueness, userID,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Kind, &t.Icon, &t.Color,
		&t.CanBeRoot, &t.DefaultDuration, &t.AutoFillEffort, &t.AddToCalendar,
		&t.CheckUniqueness, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, t)
}

func (h *ObjectTypeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var req models.CreateObjectTypeRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var t models.ObjectType
	err := h.db.QueryRow(context.Background(),
		`UPDATE object_types SET
			name = COALESCE(NULLIF($1, ''), name),
			description = $2, kind = COALESCE(NULLIF($3::text, '')::object_kind, kind),
			icon = $4, color = $5, can_be_root = $6,
			default_duration_days = $7, auto_fill_effort = $8,
			add_to_calendar = $9, check_uniqueness = $10,
			updated_at = NOW()
		 WHERE id = $11 AND workspace_id = $12
		 RETURNING id, name, description, kind, icon, color, can_be_root,
		           default_duration_days, auto_fill_effort, add_to_calendar,
		           check_uniqueness, sort_order, created_at, updated_at`,
		req.Name, req.Description, req.Kind, req.Icon, req.Color, req.CanBeRoot,
		req.DefaultDuration, req.AutoFillEffort, req.AddToCalendar,
		req.CheckUniqueness, id, wsID,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Kind, &t.Icon, &t.Color,
		&t.CanBeRoot, &t.DefaultDuration, &t.AutoFillEffort, &t.AddToCalendar,
		&t.CheckUniqueness, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "update failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, t)
}

func (h *ObjectTypeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	_, err := h.db.Exec(context.Background(), `DELETE FROM object_types WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ObjectTypeHandler) SetHierarchy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		ChildTypeIDs []string `json:"child_type_ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tx, err := h.db.Begin(context.Background())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(context.Background())

	tx.Exec(context.Background(), `DELETE FROM object_type_hierarchy WHERE parent_type_id = $1 AND workspace_id = $2`, id, wsID)
	for _, childID := range req.ChildTypeIDs {
		tx.Exec(context.Background(),
			`INSERT INTO object_type_hierarchy (workspace_id, parent_type_id, child_type_id) VALUES ($1, $2, $3)
			 ON CONFLICT DO NOTHING`, wsID, id, childID)
	}

	if err := tx.Commit(context.Background()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"child_type_ids": req.ChildTypeIDs})
}

func (h *ObjectTypeHandler) BindRequisite(w http.ResponseWriter, r *http.Request) {
	typeID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())

	var req models.BindRequisiteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	condValue, _ := json.Marshal(req.ConditionValue)

	var otr models.ObjectTypeRequisite
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO object_type_requisites
		 (workspace_id, object_type_id, requisite_id, is_required, is_visible, is_lockable,
		  inherit_to_children, sort_order, is_conditional, condition_requisite_id, condition_value)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 ON CONFLICT (object_type_id, requisite_id) DO UPDATE SET
		   is_required = EXCLUDED.is_required, is_visible = EXCLUDED.is_visible,
		   is_lockable = EXCLUDED.is_lockable, inherit_to_children = EXCLUDED.inherit_to_children,
		   sort_order = EXCLUDED.sort_order, is_conditional = EXCLUDED.is_conditional,
		   condition_requisite_id = EXCLUDED.condition_requisite_id,
		   condition_value = EXCLUDED.condition_value
		 RETURNING id, object_type_id, requisite_id, is_required, is_visible,
		           is_lockable, auto_sum, auto_avg, inherit_to_children,
		           is_olap_dimension, sort_order, is_conditional,
		           condition_requisite_id, condition_value`,
		wsID, typeID, req.RequisiteID, req.IsRequired, req.IsVisible, req.IsLockable,
		req.InheritToChildren, req.SortOrder, req.IsConditional, req.ConditionReqID, condValue,
	).Scan(&otr.ID, &otr.ObjectTypeID, &otr.RequisiteID, &otr.IsRequired, &otr.IsVisible,
		&otr.IsLockable, &otr.AutoSum, &otr.AutoAvg, &otr.InheritToChildren,
		&otr.IsOlapDimension, &otr.SortOrder, &otr.IsConditional,
		&otr.ConditionReqID, &otr.ConditionValue)

	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, otr)
}

func (h *ObjectTypeHandler) UnbindRequisite(w http.ResponseWriter, r *http.Request) {
	typeID := chi.URLParam(r, "id")
	reqID := chi.URLParam(r, "reqId")
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(),
		`DELETE FROM object_type_requisites WHERE object_type_id = $1 AND requisite_id = $2 AND workspace_id = $3`,
		typeID, reqID, wsID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *ObjectTypeHandler) ListRefTables(w http.ResponseWriter, r *http.Request) {
	typeID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT rt.id, rt.name, rt.description, rt.icon, rt.structure, rt.input_mode,
		        rt.show_on_main_page, rt.use_date, rt.date_auto_fill, rt.has_approval, rt.created_at,
		        otr.sort_order
		 FROM object_type_ref_tables otr
		 JOIN reference_tables rt ON rt.id = otr.ref_table_id
		 WHERE otr.object_type_id = $1 AND otr.workspace_id = $2
		 ORDER BY otr.sort_order`, typeID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var tables []models.ReferenceTable
	for rows.Next() {
		var t models.ReferenceTable
		var sortOrder int
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Icon, &t.Structure, &t.InputMode,
			&t.ShowOnMainPage, &t.UseDate, &t.DateAutoFill, &t.HasApproval, &t.CreatedAt,
			&sortOrder); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		tables = append(tables, t)
	}
	if tables == nil {
		tables = []models.ReferenceTable{}
	}
	writeJSONList(w, tables, len(tables))
}

func (h *ObjectTypeHandler) BindRefTable(w http.ResponseWriter, r *http.Request) {
	typeID := chi.URLParam(r, "id")
	wsID := middleware.GetWorkspaceID(r.Context())
	var req struct {
		RefTableID string `json:"ref_table_id"`
		SortOrder  int    `json:"sort_order"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	_, err := h.db.Exec(context.Background(),
		`INSERT INTO object_type_ref_tables (workspace_id, object_type_id, ref_table_id, sort_order)
		 VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
		wsID, typeID, req.RefTableID, req.SortOrder)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (h *ObjectTypeHandler) UnbindRefTable(w http.ResponseWriter, r *http.Request) {
	typeID := chi.URLParam(r, "id")
	tableID := chi.URLParam(r, "tableId")
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(),
		`DELETE FROM object_type_ref_tables WHERE object_type_id = $1 AND ref_table_id = $2 AND workspace_id = $3`,
		typeID, tableID, wsID)
	w.WriteHeader(http.StatusNoContent)
}
