package dekart

import (
	"context"
	"testing"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	protobuf "google.golang.org/protobuf/proto"
)

// Workspace members retain their own workspace status without seeing administrative data.
func TestGetWorkspaceRoleAccess(t *testing.T) {
	s, ctx := workspaceDeleteFixture(t)
	_, err := s.db.Exec(`INSERT INTO workspace_log (id,workspace_id,email,status,authored_by,role)
 VALUES ('editor','delete-me','editor@example.com',1,'editor@example.com',2),
 ('viewer','delete-me','viewer@example.com',1,'viewer@example.com',3);
 UPDATE subscription_log SET customer_id='cus_private' WHERE workspace_id='delete-me';
 INSERT INTO workspaces(id,name) VALUES('inviting','Inviting');
 INSERT INTO workspace_log(id,workspace_id,email,status,authored_by,role)
 VALUES('own-invite','inviting','admin@example.com',1,'other@example.com',2);`)
	require.NoError(t, err)
	admin, err := s.GetWorkspace(ctx, &proto.GetWorkspaceRequest{})
	require.NoError(t, err)
	require.Len(t, admin.Users, 3)
	require.Equal(t, "cus_private", admin.Subscription.CustomerId)
	require.NotZero(t, admin.Subscription.UpdatedAt)
	require.NotEmpty(t, admin.Subscription.Revision)
	require.Len(t, admin.Invites, 1)

	for _, role := range []proto.UserRole{proto.UserRole_ROLE_ADMIN, proto.UserRole_ROLE_EDITOR, proto.UserRole_ROLE_VIEWER} {
		t.Run(role.String(), func(t *testing.T) {
			roleCtx := user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", Name: "Delete me", UserRole: role, AddedUsersCount: 3, ReadOnly: true, ReadOnlyReason: proto.GetWorkspaceResponse_READ_ONLY_REASON_SUBSCRIPTION_EXPIRED})
			res, err := s.GetWorkspace(roleCtx, &proto.GetWorkspaceRequest{})
			require.NoError(t, err)
			require.True(t, protobuf.Equal(admin.Workspace, res.Workspace))
			require.Equal(t, admin.Invites, res.Invites)
			require.EqualValues(t, 3, res.AddedUsersCount)
			require.True(t, res.ReadOnly)
			require.Equal(t, proto.GetWorkspaceResponse_READ_ONLY_REASON_SUBSCRIPTION_EXPIRED, res.ReadOnlyReason)
			if role == proto.UserRole_ROLE_ADMIN {
				require.ElementsMatch(t, admin.Users, res.Users)
				require.True(t, protobuf.Equal(admin.Subscription, res.Subscription))
			} else {
				assert.Empty(t, res.Users)
				require.True(t, protobuf.Equal(&proto.Subscription{PlanType: admin.Subscription.PlanType, Expired: admin.Subscription.Expired, CancelAt: admin.Subscription.CancelAt}, res.Subscription), "subscription includes administrative fields: %v", res.Subscription)
			}
		})
	}
	// A workspace with no subscription must not acquire one when its response is reduced.
	_, err = s.db.Exec(`DELETE FROM subscription_log WHERE workspace_id='delete-me'`)
	require.NoError(t, err)
	res, err := s.GetWorkspace(user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", UserRole: proto.UserRole_ROLE_EDITOR}), &proto.GetWorkspaceRequest{})
	require.NoError(t, err)
	require.Nil(t, res.Subscription)
}

// Connection administration must reject non-admins before validating their input.
func TestConnectionRoleAccess(t *testing.T) {
	for _, tc := range []struct {
		name string
		role proto.UserRole
		code codes.Code
	}{
		{"admin", proto.UserRole_ROLE_ADMIN, codes.InvalidArgument},
		{"editor", proto.UserRole_ROLE_EDITOR, codes.PermissionDenied},
		{"viewer", proto.UserRole_ROLE_VIEWER, codes.PermissionDenied},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", UserRole: tc.role})
			_, err := s.TestConnection(ctx, &proto.TestConnectionRequest{})
			assert.Equal(t, tc.code, status.Code(err), "TestConnection")
			_, err = s.GetWherobotsConnectionHint(ctx, &proto.GetWherobotsConnectionHintRequest{})
			require.Equal(t, tc.code, status.Code(err), "GetWherobotsConnectionHint")
		})
	}
	t.Run("unauthenticated", func(t *testing.T) {
		_, err := (Server{}).GetWherobotsConnectionHint(context.Background(), &proto.GetWherobotsConnectionHintRequest{})
		require.Equal(t, codes.Unauthenticated, status.Code(err))
	})
}

type workspaceAccessReportStream struct {
	grpc.ServerStream
	ctx     context.Context
	message *proto.ReportStreamResponse
}

func (s *workspaceAccessReportStream) Context() context.Context { return s.ctx }

// Send captures the response emitted at the report stream boundary.
func (s *workspaceAccessReportStream) Send(message *proto.ReportStreamResponse) error {
	s.message = message
	return nil
}

// Only report writers receive the list of people with direct access.
func TestReportStreamDirectAccessVisibility(t *testing.T) {
	for _, tc := range []struct {
		name, email         string
		allowEdit, canWrite bool
	}{
		{"author", "admin@example.com", false, true},
		{"direct reader", "reader@example.com", false, false},
		{"workspace writer", "reader@example.com", true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			_, err := s.db.Exec(`INSERT INTO reports(id,workspace_id,author_email,allow_edit)
 VALUES('shared','delete-me','admin@example.com',?);
 INSERT INTO report_access_log(report_id,email,status,authored_by)
 VALUES('shared','reader@example.com',1,'admin@example.com'),
 ('shared','competitor@example.com',1,'admin@example.com');`, tc.allowEdit)
			require.NoError(t, err)
			ctx = context.WithValue(ctx, user.ContextKey, &user.Claims{Email: tc.email})
			ctx = user.SetWorkspaceCtx(ctx, user.WorkspaceInfo{ID: "delete-me", UserRole: proto.UserRole_ROLE_EDITOR})
			stream := &workspaceAccessReportStream{ctx: ctx}
			require.NoError(t, s.sendReportMessage("shared", stream, 1))
			require.NotNil(t, stream.message)
			require.Equal(t, tc.canWrite, stream.message.Report.CanWrite)
			if tc.canWrite {
				require.ElementsMatch(t, []string{"reader@example.com", "competitor@example.com"}, stream.message.DirectAccessEmails)
			} else {
				require.Empty(t, stream.message.DirectAccessEmails)
			}
		})
	}
}
