package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/custle/api/internal/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GridStateHandler struct {
	db *pgxpool.Pool
}

func NewGridStateHandler(db *pgxpool.Pool) *GridStateHandler {
	return &GridStateHandler{db: db}
}

// Get returns the best-match grid state: object > type > global
func (h *GridStateHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())
	gridID := r.URL.Query().Get("grid_id")
	objectID := r.URL.Query().Get("object_id")
	typeID := r.URL.Query().Get("type_id")

	if gridID == "" {
		writeError(w, http.StatusBadRequest, "grid_id required")
		return
	}

	ctx := context.Background()

	// Try object-level
	if objectID != "" {
		var state json.RawMessage
		err := h.db.QueryRow(ctx,
			`SELECT state FROM grid_states
			 WHERE workspace_id = $1 AND grid_id = $2 AND scope = 'object' AND user_id = $3 AND object_id = $4`,
			wsID, gridID, userID, objectID).Scan(&state)
		if err == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"state": state, "scope": "object"})
			return
		}
	}

	// Try type-level
	if typeID != "" {
		var state json.RawMessage
		err := h.db.QueryRow(ctx,
			`SELECT state FROM grid_states
			 WHERE workspace_id = $1 AND grid_id = $2 AND scope = 'type' AND user_id = $3 AND type_id = $4`,
			wsID, gridID, userID, typeID).Scan(&state)
		if err == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"state": state, "scope": "type"})
			return
		}
	}

	// Try global
	var state json.RawMessage
	err := h.db.QueryRow(ctx,
		`SELECT state FROM grid_states
		 WHERE workspace_id = $1 AND grid_id = $2 AND scope = 'global' AND user_id = $3
		 AND object_id IS NULL AND type_id IS NULL`,
		wsID, gridID, userID).Scan(&state)
	if err == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"state": state, "scope": "global"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"state": nil, "scope": nil})
}

// Save upserts grid state
func (h *GridStateHandler) Save(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())

	var req struct {
		GridID   string          `json:"grid_id"`
		Scope    string          `json:"scope"`
		ObjectID *string         `json:"object_id,omitempty"`
		TypeID   *string         `json:"type_id,omitempty"`
		State    json.RawMessage `json:"state"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.GridID == "" || req.Scope == "" {
		writeError(w, http.StatusBadRequest, "grid_id and scope required")
		return
	}

	ctx := context.Background()

	// Use separate queries per scope to avoid UUID/text casting issues
	switch req.Scope {
	case "object":
		if req.ObjectID == nil || *req.ObjectID == "" {
			writeError(w, http.StatusBadRequest, "object_id required for scope=object")
			return
		}
		_, err := h.db.Exec(ctx,
			`INSERT INTO grid_states (workspace_id, grid_id, scope, user_id, object_id, state, updated_at)
			 VALUES ($1, $2, 'object', $3, $4, $5, NOW())
			 ON CONFLICT (workspace_id, grid_id, scope, user_id,
			   COALESCE(object_id, '00000000-0000-0000-0000-000000000000'),
			   COALESCE(type_id, '00000000-0000-0000-0000-000000000000'))
			 DO UPDATE SET state = $5, updated_at = NOW()`,
			wsID, req.GridID, userID, *req.ObjectID, req.State)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "save failed: "+err.Error())
			return
		}

	case "type":
		if req.TypeID == nil || *req.TypeID == "" {
			writeError(w, http.StatusBadRequest, "type_id required for scope=type")
			return
		}
		_, err := h.db.Exec(ctx,
			`INSERT INTO grid_states (workspace_id, grid_id, scope, user_id, type_id, state, updated_at)
			 VALUES ($1, $2, 'type', $3, $4, $5, NOW())
			 ON CONFLICT (workspace_id, grid_id, scope, user_id,
			   COALESCE(object_id, '00000000-0000-0000-0000-000000000000'),
			   COALESCE(type_id, '00000000-0000-0000-0000-000000000000'))
			 DO UPDATE SET state = $5, updated_at = NOW()`,
			wsID, req.GridID, userID, *req.TypeID, req.State)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "save failed: "+err.Error())
			return
		}

	default: // global
		_, err := h.db.Exec(ctx,
			`INSERT INTO grid_states (workspace_id, grid_id, scope, user_id, state, updated_at)
			 VALUES ($1, $2, 'global', $3, $4, NOW())
			 ON CONFLICT (workspace_id, grid_id, scope, user_id,
			   COALESCE(object_id, '00000000-0000-0000-0000-000000000000'),
			   COALESCE(type_id, '00000000-0000-0000-0000-000000000000'))
			 DO UPDATE SET state = $4, updated_at = NOW()`,
			wsID, req.GridID, userID, req.State)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "save failed: "+err.Error())
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// Delete removes grid state
func (h *GridStateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	userID := middleware.GetUserID(r.Context())
	gridID := r.URL.Query().Get("grid_id")
	scope := r.URL.Query().Get("scope")

	if gridID == "" || scope == "" {
		writeError(w, http.StatusBadRequest, "grid_id and scope required")
		return
	}

	ctx := context.Background()
	objectID := r.URL.Query().Get("object_id")
	typeID := r.URL.Query().Get("type_id")

	switch scope {
	case "object":
		h.db.Exec(ctx,
			`DELETE FROM grid_states WHERE workspace_id=$1 AND grid_id=$2 AND scope='object' AND user_id=$3 AND object_id=$4`,
			wsID, gridID, userID, objectID)
	case "type":
		h.db.Exec(ctx,
			`DELETE FROM grid_states WHERE workspace_id=$1 AND grid_id=$2 AND scope='type' AND user_id=$3 AND type_id=$4`,
			wsID, gridID, userID, typeID)
	default:
		h.db.Exec(ctx,
			`DELETE FROM grid_states WHERE workspace_id=$1 AND grid_id=$2 AND scope='global' AND user_id=$3 AND object_id IS NULL AND type_id IS NULL`,
			wsID, gridID, userID)
	}
	w.WriteHeader(http.StatusNoContent)
}
