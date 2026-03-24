package handlers

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// seedWorkspaceDefaults populates a new workspace with default object types and settings
func seedWorkspaceDefaults(ctx context.Context, tx pgx.Tx, workspaceID string) error {
	// Default object types
	_, err := tx.Exec(ctx, `
		INSERT INTO object_types (workspace_id, name, description, kind, icon, can_be_root, color, sort_order) VALUES
		($1, 'Portfolio', 'Top-level project portfolio', 'directory', 'briefcase', true, '#6366F1', 1),
		($1, 'Program', 'Group of related projects', 'directory', 'folder', true, '#8B5CF6', 2),
		($1, 'Project', 'Project with timeline and deliverables', 'project', 'target', false, '#3B82F6', 3),
		($1, 'Stage', 'Project stage / phase', 'project', 'layers', false, '#06B6D4', 4),
		($1, 'Task', 'Individual work item', 'task', 'check-square', false, '#22C55E', 5),
		($1, 'Milestone', 'Key checkpoint', 'task', 'flag', false, '#F59E0B', 6),
		($1, 'Meeting', 'Scheduled meeting', 'task', 'users', false, '#EC4899', 7)
	`, workspaceID)
	if err != nil {
		return err
	}

	// Default hierarchy: Portfolio->Program->Project->Stage->Task, Project->Milestone, Project->Meeting
	_, err = tx.Exec(ctx, `
		INSERT INTO object_type_hierarchy (workspace_id, parent_type_id, child_type_id)
		SELECT $1, p.id, c.id
		FROM object_types p, object_types c
		WHERE p.workspace_id = $1 AND c.workspace_id = $1
		AND (
			(p.name = 'Portfolio' AND c.name = 'Program') OR
			(p.name = 'Program' AND c.name = 'Project') OR
			(p.name = 'Project' AND c.name = 'Stage') OR
			(p.name = 'Project' AND c.name = 'Task') OR
			(p.name = 'Project' AND c.name = 'Milestone') OR
			(p.name = 'Project' AND c.name = 'Meeting') OR
			(p.name = 'Stage' AND c.name = 'Task') OR
			(p.name = 'Stage' AND c.name = 'Milestone')
		)
	`, workspaceID)
	if err != nil {
		return err
	}

	// Default system settings
	_, err = tx.Exec(ctx, `
		INSERT INTO system_settings (workspace_id, key, value) VALUES
		($1, 'storage.type', '"local"'),
		($1, 'storage.local.path', '"/uploads"')
	`, workspaceID)
	return err
}
