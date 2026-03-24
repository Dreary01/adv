-- Custle Database Schema (Multi-Tenant)
-- Core tables for the configurable project management platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS ltree;

-- ═══════════════════════════════════════════════════════════
-- USERS & AUTH
-- ═══════════════════════════════════════════════════════════

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),            -- NULL for OAuth-only users
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,         -- legacy, workspace role used instead
    is_superadmin BOOLEAN DEFAULT false,     -- global platform admin
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- WORKSPACES (tenants)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id),
    is_system BOOLEAN DEFAULT false,         -- true = superadmin workspace
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE workspace_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'member',
    token VARCHAR(100) UNIQUE NOT NULL,
    invited_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_invitations_token ON workspace_invitations(token);
CREATE INDEX idx_invitations_email ON workspace_invitations(email);

-- ═══════════════════════════════════════════════════════════
-- OAUTH PROVIDERS (social login bindings)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE user_oauth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    raw_profile JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);
CREATE INDEX idx_oauth_user ON user_oauth_providers(user_id);
CREATE INDEX idx_oauth_lookup ON user_oauth_providers(provider, provider_user_id);

-- ═══════════════════════════════════════════════════════════
-- SYSTEM ROLES (legacy, kept for compatibility)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE system_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_system_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES system_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ═══════════════════════════════════════════════════════════
-- OBJECT TYPES (configurable entity types)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE object_kind AS ENUM ('directory', 'project', 'task');

CREATE TABLE object_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    kind object_kind NOT NULL DEFAULT 'task',
    icon VARCHAR(100),
    color VARCHAR(7),
    can_be_root BOOLEAN DEFAULT false,
    default_duration_days INT,
    auto_fill_effort BOOLEAN DEFAULT false,
    add_to_calendar BOOLEAN DEFAULT false,
    check_uniqueness BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_object_types_ws ON object_types(workspace_id);

CREATE TABLE object_type_hierarchy (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    child_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_type_id, child_type_id)
);
CREATE INDEX idx_oth_ws ON object_type_hierarchy(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- REQUISITES (custom field definitions)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE requisite_type AS ENUM (
    'string', 'html', 'number', 'date', 'boolean',
    'classifier', 'file', 'formula', 'counter', 'process'
);

CREATE TABLE requisite_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0
);
CREATE INDEX idx_req_groups_ws ON requisite_groups(workspace_id);

CREATE TABLE requisites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type requisite_type NOT NULL,
    group_id UUID REFERENCES requisite_groups(id),
    config JSONB DEFAULT '{}',
    is_unique BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_requisites_ws ON requisites(workspace_id);

CREATE TABLE classifier_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requisite_id UUID NOT NULL REFERENCES requisites(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES classifier_values(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_classifier_values_requisite ON classifier_values(requisite_id);
CREATE INDEX idx_classifier_ws ON classifier_values(workspace_id);

CREATE TABLE object_type_requisites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    object_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    requisite_id UUID REFERENCES requisites(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT false,
    is_visible BOOLEAN DEFAULT true,
    is_lockable BOOLEAN DEFAULT false,
    auto_sum BOOLEAN DEFAULT false,
    auto_avg BOOLEAN DEFAULT false,
    inherit_to_children BOOLEAN DEFAULT false,
    is_olap_dimension BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    is_conditional BOOLEAN DEFAULT false,
    condition_requisite_id UUID REFERENCES requisites(id),
    condition_value JSONB,
    UNIQUE (object_type_id, requisite_id)
);
CREATE INDEX idx_otr_ws ON object_type_requisites(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- REFERENCE TABLES (configurable data tables)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE ref_table_structure AS ENUM ('flat', 'hierarchical', 'vertical');
CREATE TYPE ref_table_input_mode AS ENUM ('inline', 'modal');

CREATE TABLE reference_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    structure ref_table_structure DEFAULT 'flat',
    input_mode ref_table_input_mode DEFAULT 'inline',
    show_on_main_page BOOLEAN DEFAULT false,
    use_date BOOLEAN DEFAULT false,
    date_auto_fill BOOLEAN DEFAULT true,
    has_approval BOOLEAN DEFAULT false,
    show_author BOOLEAN DEFAULT false,
    sort_requisite_id UUID REFERENCES requisites(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ref_tables_ws ON reference_tables(workspace_id);

CREATE TABLE reference_table_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    table_id UUID REFERENCES reference_tables(id) ON DELETE CASCADE,
    requisite_id UUID REFERENCES requisites(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    aggregation VARCHAR(32) DEFAULT '',
    UNIQUE (table_id, requisite_id)
);
CREATE INDEX idx_ref_cols_ws ON reference_table_columns(workspace_id);

CREATE TABLE object_type_ref_tables (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    object_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    ref_table_id UUID REFERENCES reference_tables(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    PRIMARY KEY (object_type_id, ref_table_id)
);
CREATE INDEX idx_otrt_ws ON object_type_ref_tables(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- OBJECTS (actual project items)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE object_status AS ENUM (
    'not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'
);

CREATE TYPE plan_type AS ENUM ('baseline', 'operational', 'forecast');

CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type_id UUID NOT NULL REFERENCES object_types(id),
    parent_id UUID REFERENCES objects(id),
    name VARCHAR(500) NOT NULL,
    code VARCHAR(100),
    description TEXT,
    status object_status DEFAULT 'not_started',
    priority INT DEFAULT 0,
    progress INT DEFAULT 0,
    field_values JSONB DEFAULT '{}',
    sort_order INT DEFAULT 0,
    path LTREE,
    depth INT DEFAULT 0,
    owner_id UUID REFERENCES users(id),
    assignee_id UUID REFERENCES users(id),
    actual_start_date DATE,
    actual_end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_objects_ws ON objects(workspace_id);
CREATE INDEX idx_objects_parent ON objects(parent_id);
CREATE INDEX idx_objects_type ON objects(type_id);
CREATE INDEX idx_objects_status ON objects(status);
CREATE INDEX idx_objects_assignee ON objects(assignee_id);
CREATE INDEX idx_objects_path ON objects USING GIST (path);
CREATE INDEX idx_objects_field_values ON objects USING GIN (field_values);
CREATE INDEX idx_objects_name_trgm ON objects USING GIN (name gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════
-- PLANS & DATES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE object_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    plan_type plan_type NOT NULL,
    start_date DATE,
    end_date DATE,
    duration_days INT,
    effort_hours DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (object_id, plan_type)
);
CREATE INDEX idx_plans_ws ON object_plans(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- DEPENDENCIES (task links)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE dependency_type AS ENUM ('fs', 'ff', 'ss', 'sf');

CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    predecessor_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    successor_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type dependency_type DEFAULT 'fs',
    lag_days INT DEFAULT 0,
    UNIQUE (predecessor_id, successor_id)
);
CREATE INDEX idx_deps_ws ON dependencies(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- OBJECT PARTICIPANTS
-- ═══════════════════════════════════════════════════════════

CREATE TYPE participant_role AS ENUM ('manager', 'executor', 'participant', 'observer');

CREATE TABLE object_participants (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role participant_role NOT NULL DEFAULT 'participant',
    PRIMARY KEY (object_id, user_id)
);
CREATE INDEX idx_participants_ws ON object_participants(workspace_id);
CREATE INDEX idx_object_participants_user ON object_participants(user_id);

-- ═══════════════════════════════════════════════════════════
-- PROJECT ROLES (per-type custom roles)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE project_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    object_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_proj_roles_ws ON project_roles(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- REFERENCE TABLE DATA
-- ═══════════════════════════════════════════════════════════

CREATE TABLE reference_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES reference_tables(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    parent_record_id UUID REFERENCES reference_records(id),
    data JSONB DEFAULT '{}',
    record_date DATE,
    is_approved BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_ref_records_ws ON reference_records(workspace_id);
CREATE INDEX idx_ref_records_table ON reference_records(table_id);
CREATE INDEX idx_ref_records_object ON reference_records(object_id);
CREATE INDEX idx_ref_records_data ON reference_records USING GIN (data);

-- ═══════════════════════════════════════════════════════════
-- DOCUMENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(255),
    version INT DEFAULT 1,
    parent_path VARCHAR(500) DEFAULT '/',
    storage_type VARCHAR(20) DEFAULT 'local',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_docs_ws ON documents(workspace_id);
CREATE INDEX idx_documents_object ON documents(object_id);

-- ═══════════════════════════════════════════════════════════
-- SYSTEM SETTINGS (workspace-scoped)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE system_settings (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, key)
);

-- ═══════════════════════════════════════════════════════════
-- DISCUSSIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE discussions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_disc_ws ON discussions(workspace_id);

CREATE TABLE discussion_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES discussion_messages(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_disc_msgs_ws ON discussion_messages(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- TRIGGERS / AUTOMATION
-- ═══════════════════════════════════════════════════════════

CREATE TYPE trigger_event AS ENUM (
    'object.created', 'object.updated', 'object.status_changed',
    'object.assignee_changed', 'object.field_changed',
    'object.deleted', 'object.moved',
    'document.created', 'document.updated',
    'discussion.created', 'discussion.message_added',
    'ref_record.created', 'ref_record.updated', 'ref_record.deleted',
    'timer.cron', 'timer.once'
);

CREATE TABLE triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    event trigger_event NOT NULL,
    workflow JSONB DEFAULT '{"nodes":[],"edges":[]}',
    filter JSONB DEFAULT '{}',
    cron_expression VARCHAR(100),
    retry_on_failure BOOLEAN DEFAULT false,
    timeout_seconds INT DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_triggers_ws ON triggers(workspace_id);

CREATE TABLE trigger_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    trigger_id UUID REFERENCES triggers(id) ON DELETE SET NULL,
    event trigger_event NOT NULL,
    object_id UUID,
    status VARCHAR(20) DEFAULT 'pending',
    input_data JSONB,
    output_data JSONB,
    error TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX idx_trigger_log_ws ON trigger_log(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- TEMPLATES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    object_type_id UUID REFERENCES object_types(id),
    structure JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_templates_ws ON templates(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS & SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    event_types JSONB DEFAULT '["all"]',
    is_auto BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subs_ws ON subscriptions(workspace_id);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifs_ws ON notifications(workspace_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ═══════════════════════════════════════════════════════════
-- TODOS (personal task list per user)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    is_done BOOLEAN DEFAULT false,
    due_date DATE,
    reminder_at TIMESTAMPTZ,
    object_id UUID REFERENCES objects(id) ON DELETE SET NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_todos_ws ON todos(workspace_id);
CREATE INDEX idx_todos_user ON todos(user_id, is_done);

-- ═══════════════════════════════════════════════════════════
-- NEWS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
CREATE INDEX idx_news_ws ON news(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- WIDGET LAYOUTS (workspace-scoped)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE widget_layouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('user', 'admin')),
    page_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    layout JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, scope, page_type, user_id, object_id, type_id)
);
CREATE INDEX idx_wl_ws ON widget_layouts(workspace_id);
CREATE INDEX idx_widget_layouts_lookup ON widget_layouts(workspace_id, scope, page_type, user_id);

-- ═══════════════════════════════════════════════════════════
-- PERMISSIONS (ACL) — workspace-scoped
-- ═══════════════════════════════════════════════════════════

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(30) NOT NULL,
    resource_id UUID NOT NULL,
    actions INT NOT NULL DEFAULT 0,
    recursive BOOLEAN NOT NULL DEFAULT false,
    deny BOOLEAN NOT NULL DEFAULT false,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id, resource_type, resource_id)
);
CREATE INDEX idx_perms_ws ON permissions(workspace_id);
CREATE INDEX idx_permissions_user_type ON permissions(user_id, resource_type);
CREATE INDEX idx_permissions_resource ON permissions(resource_type, resource_id);

-- ═══════════════════════════════════════════════════════════
-- ROLE PERMISSIONS (global — same for all workspaces)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role participant_role NOT NULL,
    resource_type VARCHAR(30) NOT NULL,
    actions INT NOT NULL DEFAULT 0,
    UNIQUE(role, resource_type)
);

INSERT INTO role_permissions (role, resource_type, actions) VALUES
  ('manager', 'object', 15), ('manager', 'widget', 5), ('manager', 'requisite', 5), ('manager', 'ref_table', 15),
  ('executor', 'object', 5), ('executor', 'widget', 1), ('executor', 'requisite', 5), ('executor', 'ref_table', 3),
  ('participant', 'object', 1), ('participant', 'widget', 1), ('participant', 'requisite', 1), ('participant', 'ref_table', 1),
  ('observer', 'object', 1), ('observer', 'widget', 1), ('observer', 'requisite', 0), ('observer', 'ref_table', 1)
ON CONFLICT (role, resource_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- KNOWLEDGE BASE: NOTES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL DEFAULT '',
    content TEXT DEFAULT '',
    content_json JSONB,
    tags TEXT DEFAULT '',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notes_ws ON notes(workspace_id);
CREATE INDEX idx_notes_fts ON notes USING GIN (to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(tags,'')));

CREATE TABLE note_embeddings (
    note_id UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    vector JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE note_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    link_type VARCHAR(30) DEFAULT 'relates_to',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id)
);
CREATE INDEX idx_note_links_ws ON note_links(workspace_id);

CREATE TABLE note_fragments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    selector JSONB NOT NULL
);

-- ═══════════════════════════════════════════════════════════
-- KNOWLEDGE BASE: ARTICLES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL DEFAULT '',
    content_json JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_articles_ws ON articles(workspace_id);

-- ═══════════════════════════════════════════════════════════
-- SEARCH: OBJECT EMBEDDINGS (global search index)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE object_embeddings (
    object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
    vector JSONB NOT NULL DEFAULT '{}'
);

-- Embeddings для документов (полнотекстовый поиск по содержимому)
CREATE TABLE document_embeddings (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    content_text TEXT DEFAULT '',
    vector JSONB NOT NULL DEFAULT '{}'
);

-- ═══════════════════════════════════════════════════════════
-- WIDGET CATALOG (superadmin-managed widget store)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE widget_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    preview_image TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    is_published BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE widget_installations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    catalog_widget_id UUID NOT NULL REFERENCES widget_catalog(id),
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, catalog_widget_id)
);

-- ═══════════════════════════════════════════════════════════
-- LTREE AUTO-POPULATE for objects.path
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_object_path() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path = text2ltree(replace(NEW.id::text, '-', '_'));
    ELSE
        SELECT path || text2ltree(replace(NEW.id::text, '-', '_'))
        INTO NEW.path
        FROM objects WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_objects_path ON objects;
CREATE TRIGGER trg_objects_path
    BEFORE INSERT OR UPDATE OF parent_id ON objects
    FOR EACH ROW EXECUTE FUNCTION update_object_path();

-- Backfill existing objects path
WITH RECURSIVE tree AS (
    SELECT id, parent_id, text2ltree(replace(id::text, '-', '_')) AS computed_path
    FROM objects WHERE parent_id IS NULL
    UNION ALL
    SELECT o.id, o.parent_id, t.computed_path || text2ltree(replace(o.id::text, '-', '_'))
    FROM objects o JOIN tree t ON o.parent_id = t.id
)
UPDATE objects SET path = tree.computed_path FROM tree WHERE objects.id = tree.id;

-- ═══════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════

-- Superadmin user (password: admin123)
INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin, is_superadmin) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@custle.local', '$2b$12$un/8h5kaBYUZRRyo3pnQPewZ72umoNwgOzJcRme/O3DjIl1tXAVxi', 'Admin', 'System', true, true);

-- System workspace (superadmin environment)
INSERT INTO workspaces (id, name, slug, owner_id, is_system) VALUES
('b0000000-0000-0000-0000-000000000001', 'System', 'system', 'a0000000-0000-0000-0000-000000000001', true);

-- Superadmin as workspace admin
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'admin');

-- Default system roles
INSERT INTO system_roles (name, description, permissions) VALUES
('admin', 'Full system access', '["*"]'),
('manager', 'Project management access', '["projects.*","objects.*","reports.read"]'),
('user', 'Basic access', '["objects.read","objects.update_own","discussions.*"]');

-- Default object types for system workspace
INSERT INTO object_types (workspace_id, name, description, kind, icon, can_be_root, color) VALUES
('b0000000-0000-0000-0000-000000000001', 'Portfolio', 'Top-level project portfolio', 'directory', 'briefcase', true, '#6366F1'),
('b0000000-0000-0000-0000-000000000001', 'Program', 'Group of related projects', 'directory', 'folder', true, '#8B5CF6'),
('b0000000-0000-0000-0000-000000000001', 'Project', 'Project with timeline and deliverables', 'project', 'target', false, '#3B82F6'),
('b0000000-0000-0000-0000-000000000001', 'Stage', 'Project stage / phase', 'project', 'layers', false, '#06B6D4'),
('b0000000-0000-0000-0000-000000000001', 'Task', 'Individual work item', 'task', 'check-square', false, '#22C55E'),
('b0000000-0000-0000-0000-000000000001', 'Milestone', 'Key checkpoint', 'task', 'flag', false, '#F59E0B'),
('b0000000-0000-0000-0000-000000000001', 'Meeting', 'Scheduled meeting', 'task', 'users', false, '#EC4899');

-- Default system settings for system workspace
INSERT INTO system_settings (workspace_id, key, value) VALUES
('b0000000-0000-0000-0000-000000000001', 'storage.type', '"local"'),
('b0000000-0000-0000-0000-000000000001', 'storage.local.path', '"/uploads"');
