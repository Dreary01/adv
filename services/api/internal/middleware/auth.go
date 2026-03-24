package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserIDKey contextKey = "user_id"
const UserAdminKey contextKey = "is_admin"
const WorkspaceIDKey contextKey = "workspace_id"
const WorkspaceRoleKey contextKey = "workspace_role"
const SuperAdminKey contextKey = "is_superadmin"

func Auth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenStr == authHeader {
				http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			}, jwt.WithLeeway(30*time.Second))
			if err != nil || !token.Valid {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"error":"invalid claims"}`, http.StatusUnauthorized)
				return
			}

			userID, _ := claims["sub"].(string)
			isAdmin, _ := claims["admin"].(bool)
			workspaceID, _ := claims["ws"].(string)
			workspaceRole, _ := claims["wsr"].(string)
			isSuperAdmin, _ := claims["sa"].(bool)

			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, UserAdminKey, isAdmin)
			ctx = context.WithValue(ctx, WorkspaceIDKey, workspaceID)
			ctx = context.WithValue(ctx, WorkspaceRoleKey, workspaceRole)
			ctx = context.WithValue(ctx, SuperAdminKey, isSuperAdmin)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(ctx context.Context) string {
	v, _ := ctx.Value(UserIDKey).(string)
	return v
}

func GetWorkspaceID(ctx context.Context) string {
	v, _ := ctx.Value(WorkspaceIDKey).(string)
	return v
}

func GetWorkspaceRole(ctx context.Context) string {
	v, _ := ctx.Value(WorkspaceRoleKey).(string)
	return v
}

func IsSuperAdmin(ctx context.Context) bool {
	v, _ := ctx.Value(SuperAdminKey).(bool)
	return v
}

func RequireWorkspace(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if GetWorkspaceID(r.Context()) == "" {
			http.Error(w, `{"error":"workspace not selected"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireWorkspaceAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if GetWorkspaceRole(r.Context()) != "admin" {
			http.Error(w, `{"error":"workspace admin required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireSuperAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !IsSuperAdmin(r.Context()) {
			http.Error(w, `{"error":"superadmin required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
