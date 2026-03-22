package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/adv/api/internal/config"
	"github.com/adv/api/internal/db"
	"github.com/adv/api/internal/handlers"
	"github.com/adv/api/internal/middleware"
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

	// handlers
	authH := handlers.NewAuthHandler(pool, cfg.JWTSecret)
	objectTypeH := handlers.NewObjectTypeHandler(pool)
	requisiteH := handlers.NewRequisiteHandler(pool)
	objectH := handlers.NewObjectHandler(pool)
	refTableH := handlers.NewRefTableHandler(pool)
	todoH := handlers.NewTodoHandler(pool)
	newsH := handlers.NewNewsHandler(pool)
	dashH := handlers.NewDashboardHandler(pool)
	classValH := handlers.NewClassifierValueHandler(pool)
	planH := handlers.NewPlanHandler(pool)
	depH := handlers.NewDependencyHandler(pool)
	refRecH := handlers.NewRefRecordHandler(pool)

	r := chi.NewRouter()

	// middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
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
	r.Post("/api/auth/login", authH.Login)
	r.Post("/api/auth/register", authH.Register)

	// protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret))

		r.Get("/api/auth/me", authH.Me)

		// Object Types (admin)
		r.Get("/api/object-types", objectTypeH.List)
		r.Post("/api/object-types", objectTypeH.Create)
		r.Get("/api/object-types/{id}", objectTypeH.Get)
		r.Put("/api/object-types/{id}", objectTypeH.Update)
		r.Delete("/api/object-types/{id}", objectTypeH.Delete)
		r.Put("/api/object-types/{id}/hierarchy", objectTypeH.SetHierarchy)
		r.Post("/api/object-types/{id}/requisites", objectTypeH.BindRequisite)
		r.Delete("/api/object-types/{id}/requisites/{reqId}", objectTypeH.UnbindRequisite)
		r.Get("/api/object-types/{id}/ref-tables", objectTypeH.ListRefTables)
		r.Post("/api/object-types/{id}/ref-tables", objectTypeH.BindRefTable)
		r.Delete("/api/object-types/{id}/ref-tables/{tableId}", objectTypeH.UnbindRefTable)

		// Requisites (admin)
		r.Get("/api/requisites", requisiteH.List)
		r.Post("/api/requisites", requisiteH.Create)
		r.Get("/api/requisites/{id}", requisiteH.Get)
		r.Put("/api/requisites/{id}", requisiteH.Update)
		r.Delete("/api/requisites/{id}", requisiteH.Delete)
		r.Get("/api/requisite-groups", requisiteH.ListGroups)
		r.Post("/api/requisite-groups", requisiteH.CreateGroup)

		// Reference Records
		r.Get("/api/ref-tables/{tableId}/records", refRecH.List)
		r.Post("/api/ref-tables/{tableId}/records", refRecH.Create)
		r.Put("/api/ref-records/{recordId}", refRecH.Update)
		r.Delete("/api/ref-records/{recordId}", refRecH.Delete)

		// Classifier Values
		r.Get("/api/requisites/{reqId}/values", classValH.List)
		r.Post("/api/requisites/{reqId}/values", classValH.Create)
		r.Put("/api/requisites/values/{valueId}", classValH.Update)
		r.Delete("/api/requisites/values/{valueId}", classValH.Delete)
		r.Post("/api/requisites/{reqId}/values/reorder", classValH.Reorder)

		// Objects
		r.Get("/api/objects", objectH.List)
		r.Get("/api/objects/tree", objectH.GetTree)
		r.Post("/api/objects", objectH.Create)
		r.Get("/api/objects/{id}", objectH.Get)
		r.Put("/api/objects/{id}", objectH.Update)
		r.Get("/api/objects/{id}/subtree", objectH.GetSubtree)
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

		// Reference Tables (admin)
		r.Get("/api/ref-tables", refTableH.List)
		r.Post("/api/ref-tables", refTableH.Create)
		r.Get("/api/ref-tables/{id}", refTableH.Get)
		r.Put("/api/ref-tables/{id}", refTableH.Update)
		r.Delete("/api/ref-tables/{id}", refTableH.Delete)
		r.Post("/api/ref-tables/{id}/columns", refTableH.AddColumn)
		r.Delete("/api/ref-tables/columns/{colId}", refTableH.DeleteColumn)

		// Todos
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
		log.Printf("ADV API server starting on :%s", port)
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

