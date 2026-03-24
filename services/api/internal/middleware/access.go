package middleware

import (
	"net/http"

	"github.com/custle/api/internal/access"
	"github.com/go-chi/chi/v5"
)

// RequireAdmin blocks non-admin users with 403.
// Checks workspace role (admin) from JWT claims.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wsRole := GetWorkspaceRole(r.Context())
		if wsRole != "admin" {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAccess checks that the current user has the given action on the resource
// extracted from the URL parameter. urlParam is the chi URL param name (e.g. "id").
func RequireAccess(svc *access.Service, resourceType string, action int, urlParam string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wsRole := GetWorkspaceRole(r.Context())
			if wsRole == "admin" {
				next.ServeHTTP(w, r)
				return
			}
			userID := GetUserID(r.Context())
			resourceID := chi.URLParam(r, urlParam)
			if resourceID == "" {
				next.ServeHTTP(w, r)
				return
			}
			wsID := GetWorkspaceID(r.Context())
			if !svc.CheckAccess(r.Context(), userID, wsID, resourceType, resourceID, action) {
				http.Error(w, `{"error":"access denied"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
