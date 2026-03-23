package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/adv/api/internal/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WidgetLayoutHandler struct {
	db *pgxpool.Pool
}

func NewWidgetLayoutHandler(db *pgxpool.Pool) *WidgetLayoutHandler {
	return &WidgetLayoutHandler{db: db}
}

type widgetLayoutRow struct {
	ID       string          `json:"id"`
	Scope    string          `json:"scope"`
	PageType string          `json:"page_type"`
	UserID   *string         `json:"user_id,omitempty"`
	ObjectID string          `json:"object_id"`
	TypeID   string          `json:"type_id"`
	Layout   json.RawMessage `json:"layout"`
}

// GET /api/widget-layouts?page_type=...&object_id=...&type_id=...
func (h *WidgetLayoutHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	pageType := r.URL.Query().Get("page_type")
	objectID := r.URL.Query().Get("object_id")
	typeID := r.URL.Query().Get("type_id")

	if pageType == "" {
		writeError(w, http.StatusBadRequest, "page_type is required")
		return
	}

	rows, err := h.db.Query(context.Background(),
		`SELECT id, scope, page_type, user_id, object_id, type_id, layout
		 FROM widget_layouts
		 WHERE page_type = $1
		   AND (
		     (scope = 'user' AND user_id = $2 AND (object_id = $3 OR object_id = ''))
		     OR
		     (scope = 'admin' AND (object_id = $4 OR object_id = '') AND (type_id = $5 OR type_id = ''))
		   )
		 ORDER BY scope, object_id DESC, type_id DESC`,
		pageType, userID, objectID, objectID, typeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var layouts []widgetLayoutRow
	for rows.Next() {
		var l widgetLayoutRow
		if err := rows.Scan(&l.ID, &l.Scope, &l.PageType, &l.UserID, &l.ObjectID, &l.TypeID, &l.Layout); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		layouts = append(layouts, l)
	}
	if layouts == nil {
		layouts = []widgetLayoutRow{}
	}
	writeJSON(w, http.StatusOK, layouts)
}

// PUT /api/widget-layouts
func (h *WidgetLayoutHandler) Save(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		Scope    string          `json:"scope"`
		PageType string          `json:"page_type"`
		ObjectID string          `json:"object_id"`
		TypeID   string          `json:"type_id"`
		Layout   json.RawMessage `json:"layout"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PageType == "" || req.Layout == nil {
		writeError(w, http.StatusBadRequest, "page_type and layout are required")
		return
	}
	if req.Scope != "user" && req.Scope != "admin" {
		writeError(w, http.StatusBadRequest, "scope must be 'user' or 'admin'")
		return
	}

	if req.Scope == "admin" {
		isAdmin, _ := r.Context().Value(middleware.UserAdminKey).(bool)
		if !isAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
	}

	var saveUserID *string
	if req.Scope == "user" {
		saveUserID = &userID
	}

	// Try update first, then insert
	var l widgetLayoutRow
	err := h.db.QueryRow(context.Background(),
		`UPDATE widget_layouts SET layout = $1, updated_at = NOW()
		 WHERE scope = $2 AND page_type = $3
		   AND (($4::uuid IS NULL AND user_id IS NULL) OR user_id = $4)
		   AND object_id = $5 AND type_id = $6
		 RETURNING id, scope, page_type, user_id, object_id, type_id, layout`,
		req.Layout, req.Scope, req.PageType, saveUserID, req.ObjectID, req.TypeID,
	).Scan(&l.ID, &l.Scope, &l.PageType, &l.UserID, &l.ObjectID, &l.TypeID, &l.Layout)

	if err != nil {
		// Row doesn't exist — insert
		err = h.db.QueryRow(context.Background(),
			`INSERT INTO widget_layouts (scope, page_type, user_id, object_id, type_id, layout)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id, scope, page_type, user_id, object_id, type_id, layout`,
			req.Scope, req.PageType, saveUserID, req.ObjectID, req.TypeID, req.Layout,
		).Scan(&l.ID, &l.Scope, &l.PageType, &l.UserID, &l.ObjectID, &l.TypeID, &l.Layout)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, l)
}

// DELETE /api/widget-layouts?scope=...&page_type=...&object_id=...&type_id=...
func (h *WidgetLayoutHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	scope := r.URL.Query().Get("scope")
	pageType := r.URL.Query().Get("page_type")
	objectID := r.URL.Query().Get("object_id")
	typeID := r.URL.Query().Get("type_id")

	if scope == "admin" {
		isAdmin, _ := r.Context().Value(middleware.UserAdminKey).(bool)
		if !isAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		h.db.Exec(context.Background(),
			`DELETE FROM widget_layouts WHERE scope = 'admin' AND page_type = $1 AND object_id = $2 AND type_id = $3`,
			pageType, objectID, typeID)
	} else {
		h.db.Exec(context.Background(),
			`DELETE FROM widget_layouts WHERE scope = 'user' AND user_id = $1 AND page_type = $2 AND object_id = $3`,
			userID, pageType, objectID)
	}
	w.WriteHeader(http.StatusNoContent)
}
