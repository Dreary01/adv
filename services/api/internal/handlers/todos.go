package handlers

import (
	"context"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TodoHandler struct {
	db *pgxpool.Pool
}

func NewTodoHandler(db *pgxpool.Pool) *TodoHandler {
	return &TodoHandler{db: db}
}

func (h *TodoHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())

	rows, err := h.db.Query(context.Background(),
		`SELECT t.id, t.user_id, t.title, t.is_done, t.due_date, t.reminder_at,
		        t.object_id, o.name, t.sort_order, t.created_at, t.updated_at
		 FROM todos t
		 LEFT JOIN objects o ON o.id = t.object_id
		 WHERE t.user_id = $1 AND t.workspace_id = $2
		 ORDER BY t.is_done ASC, t.due_date ASC NULLS LAST, t.sort_order, t.created_at DESC`, userID, wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var todos []models.Todo
	for rows.Next() {
		var t models.Todo
		if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.IsDone, &t.DueDate, &t.ReminderAt,
			&t.ObjectID, &t.ObjectName, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		todos = append(todos, t)
	}
	if todos == nil {
		todos = []models.Todo{}
	}
	writeJSONList(w, todos, len(todos))
}

func (h *TodoHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())
	var req models.CreateTodoRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	var t models.Todo
	err := h.db.QueryRow(context.Background(),
		`INSERT INTO todos (workspace_id, user_id, title, due_date, object_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, title, is_done, due_date, reminder_at, object_id, sort_order, created_at, updated_at`,
		wsID, userID, req.Title, req.DueDate, req.ObjectID,
	).Scan(&t.ID, &t.UserID, &t.Title, &t.IsDone, &t.DueDate, &t.ReminderAt, &t.ObjectID, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func (h *TodoHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())

	var req models.UpdateTodoRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var t models.Todo
	err := h.db.QueryRow(context.Background(),
		`UPDATE todos SET
			title = COALESCE($1, title),
			due_date = COALESCE($2, due_date),
			object_id = COALESCE($3, object_id),
			is_done = COALESCE($4, is_done),
			updated_at = NOW()
		 WHERE id = $5 AND user_id = $6 AND workspace_id = $7
		 RETURNING id, user_id, title, is_done, due_date, reminder_at, object_id, sort_order, created_at, updated_at`,
		req.Title, req.DueDate, req.ObjectID, req.IsDone, id, userID, wsID,
	).Scan(&t.ID, &t.UserID, &t.Title, &t.IsDone, &t.DueDate, &t.ReminderAt, &t.ObjectID, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "todo not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *TodoHandler) Toggle(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())

	var t models.Todo
	err := h.db.QueryRow(context.Background(),
		`UPDATE todos SET is_done = NOT is_done, updated_at = NOW()
		 WHERE id = $1 AND user_id = $2 AND workspace_id = $3
		 RETURNING id, user_id, title, is_done, due_date, reminder_at, object_id, sort_order, created_at, updated_at`,
		id, userID, wsID,
	).Scan(&t.ID, &t.UserID, &t.Title, &t.IsDone, &t.DueDate, &t.ReminderAt, &t.ObjectID, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "todo not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *TodoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r.Context())
	wsID := middleware.GetWorkspaceID(r.Context())
	h.db.Exec(context.Background(), `DELETE FROM todos WHERE id = $1 AND user_id = $2 AND workspace_id = $3`, id, userID, wsID)
	w.WriteHeader(http.StatusNoContent)
}
