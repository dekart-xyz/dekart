package dekart

import (
	"context"
	"testing"

	"dekart/src/server/user"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestRequireDeviceAuthorizeContext_UsesDefaultWorkspaceWhenDefaultFlagSet(t *testing.T) {
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "user@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{IsDefaultWorkspace: true})

	claims, workspaceID, err := requireDeviceAuthorizeContext(ctx)
	if err != nil {
		t.Fatalf("requireDeviceAuthorizeContext returned error: %v", err)
	}
	if claims == nil || claims.Email != "user@example.com" {
		t.Fatalf("unexpected claims: %#v", claims)
	}
	if workspaceID != user.GetDefaultWorkspaceID() {
		t.Fatalf("unexpected workspace id: got %q want %q", workspaceID, user.GetDefaultWorkspaceID())
	}
}

func TestRequireDeviceAuthorizeContext_RequiresWorkspaceWhenNoDefault(t *testing.T) {
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: "user@example.com"})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{})

	_, _, err := requireDeviceAuthorizeContext(ctx)
	if err == nil {
		t.Fatal("expected error when workspace context is missing")
	}
	if status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("unexpected error code: got %v", status.Code(err))
	}
}

func TestRequireDeviceAuthorizeContext_AllowsUnknownEmailOnSelfHosted(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: user.UnknownEmail})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{IsDefaultWorkspace: true})

	claims, workspaceID, err := requireDeviceAuthorizeContext(ctx)
	if err != nil {
		t.Fatalf("requireDeviceAuthorizeContext returned error: %v", err)
	}
	if claims == nil || claims.Email != user.UnknownEmail {
		t.Fatalf("unexpected claims: %#v", claims)
	}
	if workspaceID != user.GetDefaultWorkspaceID() {
		t.Fatalf("unexpected workspace id: got %q want %q", workspaceID, user.GetDefaultWorkspaceID())
	}
}

func TestRequireDeviceAuthorizeContext_RejectsUnknownEmailOnCloud(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "1")
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: user.UnknownEmail})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{IsDefaultWorkspace: true})

	_, _, err := requireDeviceAuthorizeContext(ctx)
	if err == nil {
		t.Fatal("expected login required error on cloud for unknown email")
	}
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("unexpected error code: got %v", status.Code(err))
	}
}

func TestRequireDeviceAuthorizeContext_UsesDefaultWorkspaceForSelfHostedPlayground(t *testing.T) {
	t.Setenv("DEKART_CLOUD", "")
	ctx := context.WithValue(context.Background(), user.ContextKey, &user.Claims{Email: user.UnknownEmail})
	ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{IsPlayground: true})

	claims, workspaceID, err := requireDeviceAuthorizeContext(ctx)
	if err != nil {
		t.Fatalf("requireDeviceAuthorizeContext returned error: %v", err)
	}
	if claims == nil || claims.Email != user.UnknownEmail {
		t.Fatalf("unexpected claims: %#v", claims)
	}
	if workspaceID != user.GetDefaultWorkspaceID() {
		t.Fatalf("unexpected workspace id: got %q want %q", workspaceID, user.GetDefaultWorkspaceID())
	}
}
