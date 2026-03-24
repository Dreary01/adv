package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardHandler struct {
	db *pgxpool.Pool
}

func NewDashboardHandler(db *pgxpool.Pool) *DashboardHandler {
	return &DashboardHandler{db: db}
}

func (h *DashboardHandler) Requests(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT o.id, o.type_id, o.parent_id, o.name, o.code, o.description,
		        o.status, o.priority, o.progress, o.field_values,
		        o.sort_order, o.depth, o.owner_id, o.assignee_id,
		        o.created_at, o.updated_at, o.created_by,
		        t.name, t.kind, t.color, t.icon
		 FROM objects o
		 JOIN object_types t ON t.id = o.type_id
		 WHERE o.assignee_id = $1 AND o.status IN ('not_started', 'in_progress') AND o.workspace_id = $2
		 ORDER BY o.priority DESC, o.created_at DESC
		 LIMIT 20`, userID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var objects []models.Object
	for rows.Next() {
		var o models.Object
		if err := rows.Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code, &o.Description,
			&o.Status, &o.Priority, &o.Progress, &o.FieldValues,
			&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
			&o.CreatedAt, &o.UpdatedAt, &o.CreatedBy,
			&o.TypeName, &o.TypeKind, &o.TypeColor, &o.TypeIcon); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		objects = append(objects, o)
	}
	if objects == nil {
		objects = []models.Object{}
	}
	writeJSONList(w, objects, len(objects))
}

func (h *DashboardHandler) Directions(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	rows, err := h.db.Query(context.Background(),
		`SELECT o.id, o.type_id, o.parent_id, o.name, o.code, o.description,
		        o.status, o.priority, o.progress, o.field_values,
		        o.sort_order, o.depth, o.owner_id, o.assignee_id,
		        o.created_at, o.updated_at, o.created_by,
		        t.name, t.kind, t.color, t.icon
		 FROM objects o
		 JOIN object_types t ON t.id = o.type_id
		 WHERE o.depth <= 1 AND o.workspace_id = $1
		 ORDER BY o.sort_order, o.created_at`, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	all := map[string]*models.Object{}
	var roots []*models.Object
	var ordered []string

	for rows.Next() {
		var o models.Object
		if err := rows.Scan(&o.ID, &o.TypeID, &o.ParentID, &o.Name, &o.Code, &o.Description,
			&o.Status, &o.Priority, &o.Progress, &o.FieldValues,
			&o.SortOrder, &o.Depth, &o.OwnerID, &o.AssigneeID,
			&o.CreatedAt, &o.UpdatedAt, &o.CreatedBy,
			&o.TypeName, &o.TypeKind, &o.TypeColor, &o.TypeIcon); err != nil {
			continue
		}
		obj := o
		all[o.ID] = &obj
		ordered = append(ordered, o.ID)
	}

	for _, id := range ordered {
		o := all[id]
		if o.ParentID == nil {
			roots = append(roots, o)
		} else if parent, ok := all[*o.ParentID]; ok {
			parent.Children = append(parent.Children, o)
		}
	}

	if roots == nil {
		roots = []*models.Object{}
	}
	writeJSON(w, http.StatusOK, roots)
}

func (h *DashboardHandler) Events(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT id, user_id, title, body, link, is_read, created_at
		 FROM notifications
		 WHERE user_id = $1 AND workspace_id = $2
		 ORDER BY created_at DESC
		 LIMIT 30`, userID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var notifs []models.Notification
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Body, &n.Link, &n.IsRead, &n.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		notifs = append(notifs, n)
	}
	if notifs == nil {
		notifs = []models.Notification{}
	}
	writeJSONList(w, notifs, len(notifs))
}
