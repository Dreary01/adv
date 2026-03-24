package access

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Action bitfield constants
const (
	ActionRead   = 1
	ActionCreate = 2
	ActionUpdate = 4
	ActionDelete = 8
	ActionAll    = 15
)

// Resource type constants
const (
	ResourceObject    = "object"
	ResourceRefTable  = "ref_table"
	ResourceWidget    = "widget"
	ResourceRequisite = "requisite"
)

// ─── Role permissions (global, static cache) ────────────

type rolePermKey struct {
	Role         string
	ResourceType string
}

// ─── Per-user cache ─────────────────────────────────────

type userCache struct {
	// Direct roles: objectID → role name
	roles map[string]string
	// Roles with LTREE paths for inheritance check
	rolePaths []rolePathEntry
	// Explicit exceptions: "type:id" → exceptionEntry
	exceptions map[string]exceptionEntry
	loadedAt   time.Time
}

type rolePathEntry struct {
	Path string
	Role string
}

type exceptionEntry struct {
	Actions int
	Deny    bool
}

// ─── Service ────────────────────────────────────────────

type Service struct {
	db *pgxpool.Pool

	// Per-user cache
	mu    sync.RWMutex
	users map[string]*userCache
	ttl   time.Duration

	// Global role_permissions cache
	rpMu      sync.RWMutex
	rolePerms map[rolePermKey]int // role+resourceType → actions bitmask
	rpLoaded  time.Time
}

func NewService(db *pgxpool.Pool) *Service {
	s := &Service{
		db:        db,
		users:     make(map[string]*userCache),
		ttl:       10 * time.Minute,
		rolePerms: make(map[rolePermKey]int),
	}
	s.loadRolePerms()
	return s
}

// ─── Public API ─────────────────────────────────────────

// CheckAccess checks if user has the given action on a resource.
// Algorithm: exception → role on object (via LTREE) → role_permissions → deny.
func (s *Service) CheckAccess(ctx context.Context, userID, workspaceID, resourceType, resourceID string, action int) bool {
	uc := s.getUserCache(ctx, userID, workspaceID)
	if uc == nil {
		return false
	}

	// 1. Check explicit exception
	key := resourceType + ":" + resourceID
	if ex, ok := uc.exceptions[key]; ok {
		if ex.Deny {
			return false
		}
		if ex.Actions&action == action {
			return true
		}
	}

	// 2. Determine the object context for role lookup
	objectID := resourceID // for resource_type=object
	if resourceType != ResourceObject {
		// For widgets/requisites, we'd need the parent object ID.
		// For ref_tables, check direct role_permissions without object context.
		// For now, non-object resources use exception-only or ref_table special handling.
		if resourceType == ResourceRefTable {
			return s.checkRefTableViaRole(uc, action)
		}
		return false
	}

	// 3. Find user's role on this object (direct or inherited via LTREE)
	role := s.findRole(ctx, uc, objectID, workspaceID)
	if role == "" {
		return false
	}

	// 4. Look up role_permissions
	return s.roleHasAction(role, resourceType, action)
}

// AccessFilterCTE returns a MATERIALIZED CTE + a JOIN clause + WHERE clause
// for filtering objects. Uses GiST index on objects.path for ~30ms on 5K objects.
// Returns (ctePrefix, joinClause, whereClause).
// The caller must add DISTINCT ON (o.id) to avoid duplicates from the cross join.
func (s *Service) AccessFilterCTE(userID, workspaceID string) (string, string, string) {
	uid := sanitizeUUID(userID)
	wsid := sanitizeUUID(workspaceID)
	cte := `WITH _acl AS MATERIALIZED (
		SELECT DISTINCT anc.path FROM object_participants op
		JOIN objects anc ON anc.id = op.object_id
		WHERE op.user_id = '` + uid + `' AND op.workspace_id = '` + wsid + `'
	) `
	join := `, _acl`
	where := `o.path <@ _acl.path`
	return cte, join, where
}

// InvalidateUser clears the cache for a specific user.
func (s *Service) InvalidateUser(userID string) {
	s.mu.Lock()
	for key := range s.users {
		if len(key) > len(userID) && key[:len(userID)] == userID && key[len(userID)] == ':' {
			delete(s.users, key)
		}
		if key == userID {
			delete(s.users, key)
		}
	}
	s.mu.Unlock()
}

// InvalidateRolePerms reloads the global role_permissions cache.
func (s *Service) InvalidateRolePerms() {
	s.loadRolePerms()
}

// ─── Internal ───────────────────────────────────────────

func (s *Service) findRole(ctx context.Context, uc *userCache, objectID, workspaceID string) string {
	// Direct role?
	if role, ok := uc.roles[objectID]; ok {
		return role
	}

	// Inherited: get target object's path and check ancestors
	var targetPath string
	err := s.db.QueryRow(ctx, `SELECT COALESCE(path::text, '') FROM objects WHERE id = $1 AND workspace_id = $2`, objectID, workspaceID).Scan(&targetPath)
	if err != nil || targetPath == "" {
		return ""
	}

	// Find the deepest ancestor with a role assignment
	bestRole := ""
	bestDepth := -1
	for _, rp := range uc.rolePaths {
		if rp.Path != "" && isAncestorPath(rp.Path, targetPath) {
			depth := pathDepth(rp.Path)
			if depth > bestDepth {
				bestDepth = depth
				bestRole = rp.Role
			}
		}
	}
	return bestRole
}

func (s *Service) checkRefTableViaRole(uc *userCache, action int) bool {
	// User has any role on any object → check if that role grants ref_table access
	// Use the highest-privilege role the user has
	bestActions := 0
	seen := make(map[string]bool)
	for _, role := range uc.roles {
		if seen[role] {
			continue
		}
		seen[role] = true
		a := s.getRoleActions(role, ResourceRefTable)
		if a > bestActions {
			bestActions = a
		}
	}
	for _, rp := range uc.rolePaths {
		if seen[rp.Role] {
			continue
		}
		seen[rp.Role] = true
		a := s.getRoleActions(rp.Role, ResourceRefTable)
		if a > bestActions {
			bestActions = a
		}
	}
	return bestActions&action == action
}

func (s *Service) roleHasAction(role, resourceType string, action int) bool {
	return s.getRoleActions(role, resourceType)&action == action
}

func (s *Service) getRoleActions(role, resourceType string) int {
	s.rpMu.RLock()
	defer s.rpMu.RUnlock()
	return s.rolePerms[rolePermKey{Role: role, ResourceType: resourceType}]
}

// ─── Cache loading ──────────────────────────────────────

func (s *Service) getUserCache(ctx context.Context, userID, workspaceID string) *userCache {
	cacheKey := userID + ":" + workspaceID
	s.mu.RLock()
	uc, ok := s.users[cacheKey]
	s.mu.RUnlock()

	if ok && time.Since(uc.loadedAt) < s.ttl {
		return uc
	}

	uc = s.loadUserCache(ctx, userID, workspaceID)
	if uc != nil {
		s.mu.Lock()
		s.users[cacheKey] = uc
		s.mu.Unlock()
	}
	return uc
}

func (s *Service) loadUserCache(ctx context.Context, userID, workspaceID string) *userCache {
	uc := &userCache{
		roles:      make(map[string]string),
		exceptions: make(map[string]exceptionEntry),
		loadedAt:   time.Now(),
	}

	// Load roles from object_participants
	rows, err := s.db.Query(ctx,
		`SELECT op.object_id, op.role, COALESCE(o.path::text, '')
		 FROM object_participants op
		 JOIN objects o ON o.id = op.object_id
		 WHERE op.user_id = $1 AND op.workspace_id = $2`, userID, workspaceID)
	if err != nil {
		return uc
	}
	defer rows.Close()

	for rows.Next() {
		var objID, role, path string
		if rows.Scan(&objID, &role, &path) != nil {
			continue
		}
		uc.roles[objID] = role
		if path != "" {
			uc.rolePaths = append(uc.rolePaths, rolePathEntry{Path: path, Role: role})
		}
	}

	// Load exceptions from permissions
	rows2, err := s.db.Query(ctx,
		`SELECT resource_type, resource_id, actions, deny
		 FROM permissions WHERE user_id = $1 AND workspace_id = $2`, userID, workspaceID)
	if err != nil {
		return uc
	}
	defer rows2.Close()

	for rows2.Next() {
		var resType, resID string
		var actions int
		var deny bool
		if rows2.Scan(&resType, &resID, &actions, &deny) != nil {
			continue
		}
		uc.exceptions[resType+":"+resID] = exceptionEntry{Actions: actions, Deny: deny}
	}

	return uc
}

func (s *Service) loadRolePerms() {
	ctx := context.Background()
	rows, err := s.db.Query(ctx, `SELECT role, resource_type, actions FROM role_permissions`)
	if err != nil {
		return
	}
	defer rows.Close()

	m := make(map[rolePermKey]int)
	for rows.Next() {
		var role, resType string
		var actions int
		if rows.Scan(&role, &resType, &actions) != nil {
			continue
		}
		m[rolePermKey{Role: role, ResourceType: resType}] = actions
	}

	s.rpMu.Lock()
	s.rolePerms = m
	s.rpLoaded = time.Now()
	s.rpMu.Unlock()
}

// ─── Helpers ────────────────────────────────────────────

func isAncestorPath(ancestor, target string) bool {
	if ancestor == target {
		return true
	}
	if len(target) > len(ancestor) && target[:len(ancestor)] == ancestor && target[len(ancestor)] == '.' {
		return true
	}
	return false
}

func pathDepth(path string) int {
	depth := 0
	for _, c := range path {
		if c == '.' {
			depth++
		}
	}
	return depth
}

func sanitizeUUID(s string) string {
	// Only allow UUID characters to prevent SQL injection
	result := make([]byte, 0, len(s))
	for _, c := range []byte(s) {
		if (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || c == '-' {
			result = append(result, c)
		}
	}
	return string(result)
}
