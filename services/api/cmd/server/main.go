package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/custle/api/internal/access"
	"github.com/custle/api/internal/config"
	"github.com/custle/api/internal/db"
	"github.com/custle/api/internal/handlers"
	"github.com/custle/api/internal/middleware"
	"github.com/custle/api/internal/storage"
	"github.com/custle/api/internal/telegram"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	log.Println("Connected to database")

	// access control service
	accessSvc := access.NewService(pool)

	// handlers
	authH := handlers.NewAuthHandler(pool, cfg.JWTSecret)
	objectTypeH := handlers.NewObjectTypeHandler(pool)
	requisiteH := handlers.NewRequisiteHandler(pool)
	objectH := handlers.NewObjectHandler(pool, accessSvc)
	refTableH := handlers.NewRefTableHandler(pool)
	todoH := handlers.NewTodoHandler(pool)
	newsH := handlers.NewNewsHandler(pool)
	dashH := handlers.NewDashboardHandler(pool)
	classValH := handlers.NewClassifierValueHandler(pool)
	planH := handlers.NewPlanHandler(pool)
	depH := handlers.NewDependencyHandler(pool)
	refRecH := handlers.NewRefRecordHandler(pool, accessSvc)
	widgetLayoutH := handlers.NewWidgetLayoutHandler(pool)
	userH := handlers.NewUserHandler(pool)
	permH := handlers.NewPermissionHandler(pool, accessSvc)
	participantH := handlers.NewParticipantHandler(pool)
	store := storage.NewDynamicStorage(pool, cfg.UploadPath)
	docH := handlers.NewDocumentHandler(pool, store)
	settingsH := handlers.NewSettingsHandler(pool)
	workspaceH := handlers.NewWorkspaceHandler(pool)
	superadminH := handlers.NewSuperAdminHandler(pool)
	widgetCatalogH := handlers.NewWidgetCatalogHandler(pool)
	oauthH := handlers.NewOAuthHandler(pool, cfg)
	noteH := handlers.NewNoteHandler(pool)
	noteLinkH := handlers.NewNoteLinkHandler(pool)
	articleH := handlers.NewArticleHandler(pool)
	searchH := handlers.NewGlobalSearchHandler(pool)
	gridStateH := handlers.NewGridStateHandler(pool)
	telegramBot := telegram.NewBot(pool)
	docTplH := handlers.NewDocTemplateHandler(pool, store, cfg.CarboneURL)

	r := chi.NewRouter()

	// middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5)) // gzip compression
	r.Use(chimw.RealIP)
	r.Use(chimw.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// health
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// public routes
	r.Post("/api/telegram/webhook", telegramBot.HandleWebhook)
	r.Post("/api/auth/telegram-webapp", authH.TelegramWebAppAuth)
	r.Post("/api/auth/login", authH.Login)
	r.Post("/api/auth/register", authH.Register)
	r.Get("/api/auth/oauth/{provider}", oauthH.Redirect)
	r.Get("/api/auth/oauth/{provider}/callback", oauthH.Callback)

	// ── Authenticated routes (no workspace required) ───────
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))
		r.Get("/api/auth/workspaces", authH.ListWorkspaces)
		r.Put("/api/auth/profile", authH.UpdateProfile)
		r.Post("/api/auth/switch-workspace", authH.SwitchWorkspace)
	})

	// ── Authenticated + workspace-scoped routes ────────────
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))
		r.Use(middleware.RequireWorkspace)

		r.Get("/api/auth/me", authH.Me)

		// Objects (access-controlled inside handlers)
		r.Get("/api/objects", objectH.List)
		r.Get("/api/objects/tree", objectH.GetTree)
		r.Post("/api/objects", objectH.Create)
		r.Get("/api/objects/{id}", objectH.Get)
		r.Put("/api/objects/{id}", objectH.Update)
		r.Get("/api/objects/{id}/subtree", objectH.GetSubtree)
		r.Get("/api/objects/{id}/ancestors", objectH.GetAncestors)
		r.Get("/api/objects/{id}/plans", planH.GetPlans)
		r.Put("/api/objects/{id}/plans/operational", planH.UpsertOperational)
		r.Post("/api/objects/{id}/plans/baseline", planH.CreateBaseline)
		r.Delete("/api/objects/{id}/plans/baseline", planH.DeleteBaseline)
		r.Get("/api/objects/{id}/dependencies", depH.List)
		r.Post("/api/objects/{id}/dependencies", depH.Create)
		r.Delete("/api/dependencies/{depId}", depH.Delete)
		r.Get("/api/objects/{id}/descendants-count", objectH.GetDescendantsCount)
		r.Delete("/api/objects/{id}", objectH.Delete)
		r.Patch("/api/objects/{id}/move", objectH.Move)
		r.Post("/api/objects/reorder", objectH.Reorder)

		// Documents (SVAR FileManager compatible)
		r.Get("/api/objects/{id}/documents/files", docH.ListFiles)
		r.Get("/api/objects/{id}/documents/files/*", docH.ListFiles)
		r.Post("/api/objects/{id}/documents/files/*", docH.CreateFile)
		r.Put("/api/objects/{id}/documents/files/*", docH.UpdateFile)
		r.Put("/api/objects/{id}/documents/files", docH.UpdateFile)
		r.Delete("/api/objects/{id}/documents/files", docH.DeleteFiles)
		r.Post("/api/objects/{id}/documents/upload", docH.Upload)
		r.Get("/api/objects/{id}/documents/info", docH.Info)
		r.Get("/api/objects/{id}/documents/index-status", docH.IndexStatus)
		r.Post("/api/objects/{id}/documents/reindex", docH.Reindex)
		r.Get("/api/documents/{docId}/download", docH.Download)

		// Participants
		r.Get("/api/objects/{id}/participants", participantH.List)
		r.Post("/api/objects/{id}/participants", participantH.Add)
		r.Put("/api/objects/{id}/participants/{userId}", participantH.Update)
		r.Delete("/api/objects/{id}/participants/{userId}", participantH.Delete)

		// Reference Records (access-controlled inside handler)
		r.Get("/api/ref-tables/{tableId}/records", refRecH.List)
		r.Get("/api/ref-tables/{tableId}/aggregations", refRecH.Aggregations)
		r.Post("/api/ref-tables/{tableId}/records", refRecH.Create)
		r.Put("/api/ref-records/{recordId}", refRecH.Update)
		r.Delete("/api/ref-records/{recordId}", refRecH.Delete)

		// Classifier Values (read for all, write admin-only handled inside)
		r.Get("/api/requisites/{reqId}/values", classValH.List)
		r.Post("/api/requisites/{reqId}/values", classValH.Create)
		r.Put("/api/requisites/values/{valueId}", classValH.Update)
		r.Delete("/api/requisites/values/{valueId}", classValH.Delete)
		r.Post("/api/requisites/{reqId}/values/reorder", classValH.Reorder)

		// Todos (per-user)
		r.Get("/api/todos", todoH.List)
		r.Post("/api/todos", todoH.Create)
		r.Put("/api/todos/{id}", todoH.Update)
		r.Patch("/api/todos/{id}/toggle", todoH.Toggle)
		r.Delete("/api/todos/{id}", todoH.Delete)

		// News
		r.Get("/api/news", newsH.List)
		r.Post("/api/news", newsH.Create)

		// Dashboard
		r.Get("/api/dashboard/requests", dashH.Requests)
		r.Get("/api/dashboard/directions", dashH.Directions)
		r.Get("/api/dashboard/events", dashH.Events)

		// Widget Layouts
		r.Get("/api/widget-layouts", widgetLayoutH.Get)
		r.Put("/api/widget-layouts", widgetLayoutH.Save)
		r.Delete("/api/widget-layouts", widgetLayoutH.Delete)

		// Modules
		r.Get("/api/modules", settingsH.Modules)

		// Knowledge Base (module-gated)
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireModule(pool, "knowledge_base"))

			r.Get("/api/notes", noteH.List)
			r.Post("/api/notes", noteH.Create)
			r.Get("/api/notes/{id}", noteH.Get)
			r.Put("/api/notes/{id}", noteH.Update)
			r.Delete("/api/notes/{id}", noteH.Delete)
			r.Get("/api/notes/{id}/graph", noteH.GetGraph)

			r.Get("/api/note-links", noteLinkH.List)
			r.Post("/api/note-links", noteLinkH.Create)
			r.Delete("/api/note-links/{id}", noteLinkH.Delete)

			r.Get("/api/articles", articleH.List)
			r.Post("/api/articles", articleH.Create)
			r.Get("/api/articles/{id}", articleH.Get)
			r.Put("/api/articles/{id}", articleH.Update)
			r.Delete("/api/articles/{id}", articleH.Delete)
		})

		// Word cloud
		r.Get("/api/knowledge-graph/word-cloud", noteH.WordCloud)

		// Global Search
		r.Post("/api/search", searchH.Search)

		// Telegram link
		r.Post("/api/telegram/link-code", telegramBot.GenerateLinkCode)
		r.Get("/api/telegram/status", telegramBot.LinkStatus)

		// Grid States (column/sort/filter persistence)
		r.Get("/api/grid-states", gridStateH.Get)
		r.Put("/api/grid-states", gridStateH.Save)
		r.Delete("/api/grid-states", gridStateH.Delete)

		// Document Templates & Generation
		r.Get("/api/document-templates", docTplH.List)
		r.Get("/api/document-templates/{id}", docTplH.Get)
		r.Get("/api/document-templates/{id}/studio-config", docTplH.StudioConfig)
		r.Post("/api/objects/{id}/generate/{templateId}", docTplH.Generate)

		// Read-only for non-admin: object types, requisites, ref-tables lists
		r.Get("/api/object-types", objectTypeH.List)
		r.Get("/api/object-types/{id}", objectTypeH.Get)
		r.Get("/api/object-types/{id}/ref-tables", objectTypeH.ListRefTables)
		r.Get("/api/requisites", requisiteH.List)
		r.Get("/api/requisites/{id}", requisiteH.Get)
		r.Get("/api/requisite-groups", requisiteH.ListGroups)
		r.Get("/api/ref-tables", refTableH.List)
		r.Get("/api/ref-tables/{id}", refTableH.Get)
	})

	// ── Admin-only routes (workspace-scoped) ────────────────
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))
		r.Use(middleware.RequireWorkspace)
		r.Use(middleware.RequireAdmin)

		// Users management
		r.Get("/api/users", userH.List)
		r.Post("/api/users", userH.Create)
		r.Get("/api/users/{id}", userH.Get)
		r.Put("/api/users/{id}", userH.Update)
		r.Delete("/api/users/{id}", userH.Delete)
		r.Put("/api/users/{id}/password", userH.ResetPassword)

		// Permissions management
		// Settings
		r.Get("/api/admin/settings", settingsH.List)
		r.Put("/api/admin/settings", settingsH.Update)

		r.Get("/api/permissions", permH.List)
		r.Post("/api/permissions", permH.Create)
		r.Put("/api/permissions/{id}", permH.Update)
		r.Delete("/api/permissions/{id}", permH.Delete)

		// Object Types (write)
		r.Post("/api/object-types", objectTypeH.Create)
		r.Put("/api/object-types/{id}", objectTypeH.Update)
		r.Delete("/api/object-types/{id}", objectTypeH.Delete)
		r.Put("/api/object-types/{id}/hierarchy", objectTypeH.SetHierarchy)
		r.Post("/api/object-types/{id}/requisites", objectTypeH.BindRequisite)
		r.Delete("/api/object-types/{id}/requisites/{reqId}", objectTypeH.UnbindRequisite)
		r.Post("/api/object-types/{id}/ref-tables", objectTypeH.BindRefTable)
		r.Delete("/api/object-types/{id}/ref-tables/{tableId}", objectTypeH.UnbindRefTable)

		// Requisites (write)
		r.Post("/api/requisites", requisiteH.Create)
		r.Put("/api/requisites/{id}", requisiteH.Update)
		r.Delete("/api/requisites/{id}", requisiteH.Delete)
		r.Post("/api/requisite-groups", requisiteH.CreateGroup)

		// Document Templates (admin write)
		r.Post("/api/document-templates", docTplH.Create)
		r.Delete("/api/document-templates/{id}", docTplH.Delete)

		// Reference Tables (config — write)
		r.Post("/api/ref-tables", refTableH.Create)
		r.Put("/api/ref-tables/{id}", refTableH.Update)
		r.Delete("/api/ref-tables/{id}", refTableH.Delete)
		r.Post("/api/ref-tables/{id}/columns", refTableH.AddColumn)
		r.Put("/api/ref-tables/columns/{colId}", refTableH.UpdateColumn)
		r.Delete("/api/ref-tables/columns/{colId}", refTableH.DeleteColumn)
	})

	// ── Workspace management (workspace admin) ──────────────
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))
		r.Use(middleware.RequireWorkspace)

		r.Get("/api/workspaces/current", workspaceH.GetCurrent)
		r.Get("/api/workspaces/members", workspaceH.ListMembers)

		// Widget catalog (browse & install)
		r.Get("/api/widget-catalog", widgetCatalogH.List)
		r.Post("/api/widget-catalog/{id}/install", widgetCatalogH.Install)
		r.Delete("/api/widget-catalog/{id}/uninstall", widgetCatalogH.Uninstall)

		// Workspace admin only
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireWorkspaceAdmin)
			r.Put("/api/workspaces/current", workspaceH.UpdateCurrent)
			r.Post("/api/workspaces/members/invite", workspaceH.InviteMember)
			r.Delete("/api/workspaces/members/{userId}", workspaceH.RemoveMember)
			r.Put("/api/workspaces/members/{userId}", workspaceH.UpdateMemberRole)
		})
	})

	// ── Accept invitation (authenticated, no workspace required) ──
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))
		r.Post("/api/invitations/accept", workspaceH.AcceptInvitation)
	})

	// ── Superadmin routes ───────────────────────────────────
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))
		r.Use(middleware.RequireSuperAdmin)

		r.Get("/api/superadmin/stats", superadminH.Stats)
		r.Get("/api/superadmin/workspaces", superadminH.ListWorkspaces)
		r.Put("/api/superadmin/workspaces/{id}", superadminH.UpdateWorkspace)
		r.Get("/api/superadmin/users", superadminH.ListUsers)
		r.Get("/api/superadmin/settings", superadminH.GetGlobalSettings)
		r.Put("/api/superadmin/settings", superadminH.UpdateGlobalSettings)
		r.Post("/api/superadmin/telegram/test", superadminH.TestTelegram)
		r.Post("/api/superadmin/telegram/set-webhook", superadminH.SetTelegramWebhook)

		// Widget catalog management (superadmin creates/publishes)
		r.Post("/api/widget-catalog", widgetCatalogH.Create)
		r.Put("/api/widget-catalog/{id}", widgetCatalogH.Update)
		r.Delete("/api/widget-catalog/{id}", widgetCatalogH.Delete)
		r.Put("/api/widget-catalog/{id}/publish", widgetCatalogH.Publish)
	})

	// start server
	port := cfg.Port
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("Custle API server starting on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

