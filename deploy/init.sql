-- ADV Platform Database Schema
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
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    name VARCHAR(255) NOT NULL,
    description TEXT,
    kind object_kind NOT NULL DEFAULT 'task',
    icon VARCHAR(100),
    color VARCHAR(7),

    -- defaults
    can_be_root BOOLEAN DEFAULT false,
    default_duration_days INT,
    auto_fill_effort BOOLEAN DEFAULT false,
    add_to_calendar BOOLEAN DEFAULT false,
    check_uniqueness BOOLEAN DEFAULT false,

    -- ordering
    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Which child types can be nested under which parent types
CREATE TABLE object_type_hierarchy (
    parent_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    child_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_type_id, child_type_id)
);

-- ═══════════════════════════════════════════════════════════
-- REQUISITES (custom field definitions)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE requisite_type AS ENUM (
    'string', 'html', 'number', 'date', 'boolean',
    'classifier', 'file', 'formula', 'counter', 'process'
);

CREATE TABLE requisite_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sort_order INT DEFAULT 0
);

CREATE TABLE requisites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type requisite_type NOT NULL,
    group_id UUID REFERENCES requisite_groups(id),

    -- type-specific config stored as JSONB
    -- string: { min_length, max_length, format: "text"|"url"|"email" }
    -- number: { min, max, precision }
    -- classifier: { values: [...], multiple: bool, hierarchical: bool }
    -- formula: { expression: "..." }
    -- counter: { prefix, suffix, start, step }
    -- process: { stages: [...] }
    config JSONB DEFAULT '{}',

    is_unique BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classifier values (predefined options for classifier-type requisites)
CREATE TABLE classifier_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requisite_id UUID NOT NULL REFERENCES requisites(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES classifier_values(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_classifier_values_requisite ON classifier_values(requisite_id);

-- Binding requisites to object types with per-binding settings
CREATE TABLE object_type_requisites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

    -- conditional visibility
    is_conditional BOOLEAN DEFAULT false,
    condition_requisite_id UUID REFERENCES requisites(id),
    condition_value JSONB,

    UNIQUE (object_type_id, requisite_id)
);

-- ═══════════════════════════════════════════════════════════
-- REFERENCE TABLES (configurable data tables / справочники)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE ref_table_structure AS ENUM ('flat', 'hierarchical', 'vertical');
CREATE TYPE ref_table_input_mode AS ENUM ('inline', 'modal');

CREATE TABLE reference_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Columns of a reference table
CREATE TABLE reference_table_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID REFERENCES reference_tables(id) ON DELETE CASCADE,
    requisite_id UUID REFERENCES requisites(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    UNIQUE (table_id, requisite_id)
);

-- Binding reference tables to object types
CREATE TABLE object_type_ref_tables (
    object_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    ref_table_id UUID REFERENCES reference_tables(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    PRIMARY KEY (object_type_id, ref_table_id)
);

-- ═══════════════════════════════════════════════════════════
-- OBJECTS (actual project items)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE object_status AS ENUM (
    'not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'
);

CREATE TYPE plan_type AS ENUM ('baseline', 'operational', 'forecast');

CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_id UUID NOT NULL REFERENCES object_types(id),
    parent_id UUID REFERENCES objects(id),

    name VARCHAR(500) NOT NULL,
    code VARCHAR(100),
    description TEXT,
    status object_status DEFAULT 'not_started',
    priority INT DEFAULT 0,  -- 0=none, 1=low, 2=medium, 3=high, 4=critical
    progress INT DEFAULT 0,  -- 0-100

    -- custom field values stored as JSONB
    -- { "requisite_uuid": value, ... }
    field_values JSONB DEFAULT '{}',

    -- tree structure
    sort_order INT DEFAULT 0,
    path LTREE,  -- materialized path for fast tree queries
    depth INT DEFAULT 0,

    -- people
    owner_id UUID REFERENCES users(id),
    assignee_id UUID REFERENCES users(id),

    -- actual dates (set automatically on status transitions)
    actual_start_date DATE,
    actual_end_date DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_objects_parent_id ON objects(parent_id);

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

-- ═══════════════════════════════════════════════════════════
-- DEPENDENCIES (task links)
-- ═══════════════════════════════════════════════════════════

CREATE TYPE dependency_type AS ENUM ('fs', 'ff', 'ss', 'sf');

CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    predecessor_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    successor_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type dependency_type DEFAULT 'fs',
    lag_days INT DEFAULT 0,
    UNIQUE (predecessor_id, successor_id)
);

-- ═══════════════════════════════════════════════════════════
-- OBJECT PARTICIPANTS
-- ═══════════════════════════════════════════════════════════

CREATE TYPE participant_role AS ENUM ('manager', 'executor', 'participant', 'observer');

CREATE TABLE object_participants (
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role participant_role NOT NULL DEFAULT 'participant',
    PRIMARY KEY (object_id, user_id)
);

-- ═══════════════════════════════════════════════════════════
-- PROJECT ROLES (per-type custom roles)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE project_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    object_type_id UUID REFERENCES object_types(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- REFERENCE TABLE DATA (rows in справочники)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE reference_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID NOT NULL REFERENCES reference_tables(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    parent_record_id UUID REFERENCES reference_records(id),

    -- row data: { "requisite_uuid": value, ... }
    data JSONB DEFAULT '{}',

    record_date DATE,
    is_approved BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_ref_records_table ON reference_records(table_id);
CREATE INDEX idx_ref_records_object ON reference_records(object_id);
CREATE INDEX idx_ref_records_data ON reference_records USING GIN (data);

-- ═══════════════════════════════════════════════════════════
-- DOCUMENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(255),
    version INT DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- ═══════════════════════════════════════════════════════════
-- DISCUSSIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE discussions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE TABLE discussion_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES discussion_messages(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

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
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,

    event trigger_event NOT NULL,

    -- visual workflow definition (node-based)
    -- { nodes: [...], edges: [...] }
    workflow JSONB DEFAULT '{"nodes":[],"edges":[]}',

    -- simple filter conditions (no-code)
    -- { object_type_id: "...", field_conditions: [...] }
    filter JSONB DEFAULT '{}',

    -- for timer triggers
    cron_expression VARCHAR(100),

    -- execution settings
    retry_on_failure BOOLEAN DEFAULT false,
    timeout_seconds INT DEFAULT 30,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE TABLE trigger_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- ═══════════════════════════════════════════════════════════
-- TEMPLATES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    object_type_id UUID REFERENCES object_types(id),

    -- full WBS structure as JSONB tree
    structure JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS & SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    event_types JSONB DEFAULT '["all"]',
    is_auto BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ═══════════════════════════════════════════════════════════
-- TODOS (personal task list per user)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_todos_user ON todos(user_id, is_done);

-- ═══════════════════════════════════════════════════════════
-- NEWS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    body TEXT,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- ═══════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════

-- Default admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, is_admin) VALUES
('admin@adv.local', '$2b$12$un/8h5kaBYUZRRyo3pnQPewZ72umoNwgOzJcRme/O3DjIl1tXAVxi', 'Admin', 'System', true);

-- Default system roles
INSERT INTO system_roles (name, description, permissions) VALUES
('admin', 'Full system access', '["*"]'),
('manager', 'Project management access', '["projects.*","objects.*","reports.read"]'),
('user', 'Basic access', '["objects.read","objects.update_own","discussions.*"]');

-- Default object types
INSERT INTO object_types (name, description, kind, icon, can_be_root, color) VALUES
('Portfolio', 'Top-level project portfolio', 'directory', 'briefcase', true, '#6366F1'),
('Program', 'Group of related projects', 'directory', 'folder', true, '#8B5CF6'),
('Project', 'Project with timeline and deliverables', 'project', 'target', false, '#3B82F6'),
('Stage', 'Project stage / phase', 'project', 'layers', false, '#06B6D4'),
('Task', 'Individual work item', 'task', 'check-square', false, '#22C55E'),
('Milestone', 'Key checkpoint', 'task', 'flag', false, '#F59E0B'),
('Meeting', 'Scheduled meeting', 'task', 'users', false, '#EC4899');
