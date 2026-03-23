package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID        string          `json:"id"`
	Email     string          `json:"email"`
	FirstName string          `json:"first_name"`
	LastName  string          `json:"last_name"`
	AvatarURL *string         `json:"avatar_url,omitempty"`
	IsActive  bool            `json:"is_active"`
	IsAdmin   bool            `json:"is_admin"`
	Settings  json.RawMessage `json:"settings,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

type ObjectType struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Description      *string `json:"description,omitempty"`
	Kind             string  `json:"kind"` // directory, project, task
	Icon             *string `json:"icon,omitempty"`
	Color            *string `json:"color,omitempty"`
	CanBeRoot        bool    `json:"can_be_root"`
	DefaultDuration  *int    `json:"default_duration_days,omitempty"`
	AutoFillEffort   bool    `json:"auto_fill_effort"`
	AddToCalendar    bool    `json:"add_to_calendar"`
	CheckUniqueness  bool    `json:"check_uniqueness"`
	SortOrder        int     `json:"sort_order"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`

	// joined data
	Requisites    []ObjectTypeRequisite `json:"requisites,omitempty"`
	ChildTypes    []string              `json:"child_type_ids,omitempty"`
	ParentTypes   []string              `json:"parent_type_ids,omitempty"`
	RefTables     []string              `json:"ref_table_ids,omitempty"`
}

type Requisite struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description *string         `json:"description,omitempty"`
	Type        string          `json:"type"`
	GroupID     *string         `json:"group_id,omitempty"`
	GroupName   *string         `json:"group_name,omitempty"`
	Config      json.RawMessage `json:"config"`
	IsUnique    bool            `json:"is_unique"`
	CreatedAt   time.Time       `json:"created_at"`
}

type ClassifierValue struct {
	ID          string    `json:"id"`
	RequisiteID string    `json:"requisite_id"`
	ParentID    *string   `json:"parent_id,omitempty"`
	Name        string    `json:"name"`
	SortOrder   int       `json:"sort_order"`
	IsLocked    bool      `json:"is_locked"`
	CreatedAt   time.Time `json:"created_at"`
	Children    []*ClassifierValue `json:"children,omitempty"`
}

type ObjectTypeRequisite struct {
	ID                  string          `json:"id"`
	ObjectTypeID        string          `json:"object_type_id"`
	RequisiteID         string          `json:"requisite_id"`
	Requisite           *Requisite      `json:"requisite,omitempty"`
	IsRequired          bool            `json:"is_required"`
	IsVisible           bool            `json:"is_visible"`
	IsLockable          bool            `json:"is_lockable"`
	AutoSum             bool            `json:"auto_sum"`
	AutoAvg             bool            `json:"auto_avg"`
	InheritToChildren   bool            `json:"inherit_to_children"`
	IsOlapDimension     bool            `json:"is_olap_dimension"`
	SortOrder           int             `json:"sort_order"`
	IsConditional       bool            `json:"is_conditional"`
	ConditionReqID      *string         `json:"condition_requisite_id,omitempty"`
	ConditionValue      json.RawMessage `json:"condition_value,omitempty"`
}

type Object struct {
	ID          string          `json:"id"`
	TypeID      string          `json:"type_id"`
	ParentID    *string         `json:"parent_id,omitempty"`
	Name        string          `json:"name"`
	Code        *string         `json:"code,omitempty"`
	Description *string         `json:"description,omitempty"`
	Status      string          `json:"status"`
	Priority    int             `json:"priority"`
	Progress    int             `json:"progress"`
	FieldValues json.RawMessage `json:"field_values"`
	SortOrder   int             `json:"sort_order"`
	Depth       int             `json:"depth"`
	OwnerID     *string         `json:"owner_id,omitempty"`
	AssigneeID  *string         `json:"assignee_id,omitempty"`
	ActualStart *string         `json:"actual_start_date,omitempty"`
	ActualEnd   *string         `json:"actual_end_date,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	CreatedBy   *string         `json:"created_by,omitempty"`

	// joined
	TypeName     string    `json:"type_name,omitempty"`
	TypeKind     string    `json:"type_kind,omitempty"`
	TypeColor    *string   `json:"type_color,omitempty"`
	TypeIcon     *string   `json:"type_icon,omitempty"`
	PlanStart    *string   `json:"plan_start_date,omitempty"`
	PlanEnd      *string   `json:"plan_end_date,omitempty"`
	PlanDuration *int      `json:"plan_duration_days,omitempty"`
	Children     []*Object `json:"children,omitempty"`
	Plans        []Plan    `json:"plans,omitempty"`
}

type Plan struct {
	ID          string  `json:"id"`
	ObjectID    string  `json:"object_id"`
	PlanType    string  `json:"plan_type"` // baseline, operational, forecast
	StartDate   *string `json:"start_date,omitempty"`
	EndDate     *string `json:"end_date,omitempty"`
	DurationDays *int   `json:"duration_days,omitempty"`
	EffortHours *float64 `json:"effort_hours,omitempty"`
}

type Dependency struct {
	ID            string `json:"id"`
	PredecessorID string `json:"predecessor_id"`
	SuccessorID   string `json:"successor_id"`
	Type          string `json:"type"` // fs, ff, ss, sf
	LagDays       int    `json:"lag_days"`
}

type ReferenceTable struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Description    *string `json:"description,omitempty"`
	Icon           *string `json:"icon,omitempty"`
	Structure      string  `json:"structure"`
	InputMode      string  `json:"input_mode"`
	ShowOnMainPage bool    `json:"show_on_main_page"`
	UseDate        bool    `json:"use_date"`
	DateAutoFill   bool    `json:"date_auto_fill"`
	HasApproval    bool    `json:"has_approval"`
	CreatedAt      time.Time `json:"created_at"`

	Columns []RefTableColumn `json:"columns,omitempty"`
}

type RefTableColumn struct {
	ID          string     `json:"id"`
	TableID     string     `json:"table_id"`
	RequisiteID string     `json:"requisite_id"`
	Requisite   *Requisite `json:"requisite,omitempty"`
	SortOrder   int        `json:"sort_order"`
	IsVisible   bool       `json:"is_visible"`
	Aggregation string     `json:"aggregation"`
}

type Trigger struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Description    *string         `json:"description,omitempty"`
	IsActive       bool            `json:"is_active"`
	Event          string          `json:"event"`
	Workflow       json.RawMessage `json:"workflow"`
	Filter         json.RawMessage `json:"filter"`
	CronExpression *string         `json:"cron_expression,omitempty"`
	RetryOnFailure bool            `json:"retry_on_failure"`
	TimeoutSeconds int             `json:"timeout_seconds"`
	CreatedAt      time.Time       `json:"created_at"`
}

type Todo struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Title      string    `json:"title"`
	IsDone     bool      `json:"is_done"`
	DueDate    *string   `json:"due_date,omitempty"`
	ReminderAt *string   `json:"reminder_at,omitempty"`
	ObjectID   *string   `json:"object_id,omitempty"`
	ObjectName *string   `json:"object_name,omitempty"`
	SortOrder  int       `json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type News struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Body        *string   `json:"body,omitempty"`
	IsPublished bool      `json:"is_published"`
	CreatedAt   time.Time `json:"created_at"`
	CreatedBy   *string   `json:"created_by,omitempty"`
	AuthorName  *string   `json:"author_name,omitempty"`
}

type Notification struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	Body      *string   `json:"body,omitempty"`
	Link      *string   `json:"link,omitempty"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// API request/response types

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type CreateObjectTypeRequest struct {
	Name            string  `json:"name"`
	Description     *string `json:"description"`
	Kind            string  `json:"kind"`
	Icon            *string `json:"icon"`
	Color           *string `json:"color"`
	CanBeRoot       bool    `json:"can_be_root"`
	DefaultDuration *int    `json:"default_duration_days"`
	AutoFillEffort  bool    `json:"auto_fill_effort"`
	AddToCalendar   bool    `json:"add_to_calendar"`
	CheckUniqueness bool    `json:"check_uniqueness"`
}

type CreateRequisiteRequest struct {
	Name        string          `json:"name"`
	Description *string         `json:"description"`
	Type        string          `json:"type"`
	GroupID     *string         `json:"group_id"`
	Config      json.RawMessage `json:"config"`
	IsUnique    bool            `json:"is_unique"`
}

type BindRequisiteRequest struct {
	RequisiteID       string          `json:"requisite_id"`
	IsRequired        bool            `json:"is_required"`
	IsVisible         bool            `json:"is_visible"`
	IsLockable        bool            `json:"is_lockable"`
	InheritToChildren bool            `json:"inherit_to_children"`
	SortOrder         int             `json:"sort_order"`
	IsConditional     bool            `json:"is_conditional"`
	ConditionReqID    *string         `json:"condition_requisite_id"`
	ConditionValue    json.RawMessage `json:"condition_value"`
}

type CreateObjectRequest struct {
	TypeID      string          `json:"type_id"`
	ParentID    *string         `json:"parent_id"`
	Name        string          `json:"name"`
	Code        *string         `json:"code"`
	Description *string         `json:"description"`
	Status      string          `json:"status"`
	Priority    int             `json:"priority"`
	FieldValues json.RawMessage `json:"field_values"`
	AssigneeID  *string         `json:"assignee_id"`
}

type UpdatePlanRequest struct {
	StartDate    *string  `json:"start_date"`
	EndDate      *string  `json:"end_date"`
	DurationDays *int     `json:"duration_days"`
	EffortHours  *float64 `json:"effort_hours"`
}

type MoveObjectRequest struct {
	ParentID  *string `json:"parent_id"`
	SortOrder *int    `json:"sort_order"`
}

type CreateTodoRequest struct {
	Title    string  `json:"title"`
	DueDate  *string `json:"due_date,omitempty"`
	ObjectID *string `json:"object_id,omitempty"`
}

type UpdateTodoRequest struct {
	Title    *string `json:"title,omitempty"`
	DueDate  *string `json:"due_date,omitempty"`
	ObjectID *string `json:"object_id,omitempty"`
	IsDone   *bool   `json:"is_done,omitempty"`
}

type CreateNewsRequest struct {
	Title string  `json:"title"`
	Body  *string `json:"body,omitempty"`
}

type APIResponse struct {
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
	Total *int        `json:"total,omitempty"`
}
