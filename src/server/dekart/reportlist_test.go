package dekart

import (
	"context"
	"testing"

	"dekart/src/proto"
	"dekart/src/server/user"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
)

type reportListTestStream struct {
	grpc.ServerStream
	message *proto.ReportListResponse
}

// Send captures the list delivered to a member at the stream boundary.
func (s *reportListTestStream) Send(message *proto.ReportListResponse) error {
	s.message = message
	return nil
}

// Email-shared maps are listed only for recipients who can open them in this workspace.
func TestReportListEmailAccess(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change string
		listed bool
	}{
		{"email access", "", true},
		{"revoked", `INSERT INTO report_access_log(report_id,email,status,authored_by,created_at)
   VALUES('shared','member@example.com',2,'admin@example.com','2026-02-02');`, false},
		{"archived", `UPDATE reports SET archived=true WHERE id='shared';`, false},
		{"public without email access", `DELETE FROM report_access_log; UPDATE reports SET is_public=true WHERE id='shared';`, false},
		{"connection cannot serve others", `UPDATE connections SET cloud_storage_bucket='' WHERE id='shared-connection';`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := workspaceDeleteFixture(t)
			_, err := s.db.Exec(`INSERT INTO workspaces(id,name) VALUES('other','Other');
    INSERT INTO workspace_log(id,workspace_id,email,status,authored_by,role) VALUES
    ('member','delete-me','member@example.com',1,'member@example.com',2),
    ('unshared','delete-me','unshared@example.com',1,'unshared@example.com',3),
    ('outsider','other','outsider@example.com',1,'outsider@example.com',1);
    INSERT INTO reports(id,workspace_id,author_email) VALUES('shared','delete-me','admin@example.com');
    INSERT INTO connections(id,connection_name,connection_type,cloud_storage_bucket) VALUES('shared-connection','Shared',1,'shared-bucket');
    INSERT INTO datasets(id,report_id,connection_id) VALUES('shared-dataset','shared','shared-connection');
    INSERT INTO report_access_log(report_id,email,status,authored_by,created_at) VALUES
    ('shared','member@example.com',2,'admin@example.com','2026-01-01'),
    ('shared','member@example.com',1,'admin@example.com','2026-02-01'),
    ('shared','outsider@example.com',1,'admin@example.com','2026-02-01');`)
			require.NoError(t, err)
			// Each mutation preserves the same report and recipient as the original grant.
			if tc.change != "" {
				_, err = s.db.Exec(tc.change)
				require.NoError(t, err)
			}
			for _, role := range []proto.UserRole{proto.UserRole_ROLE_ADMIN, proto.UserRole_ROLE_EDITOR, proto.UserRole_ROLE_VIEWER} {
				memberCtx := context.WithValue(ctx, user.ContextKey, &user.Claims{Email: "member@example.com"})
				memberCtx = user.SetWorkspaceCtx(memberCtx, user.WorkspaceInfo{ID: "delete-me", UserRole: role})
				stream := &reportListTestStream{}
				require.NoError(t, s.sendReportList(memberCtx, stream, 1))
				require.NotNil(t, stream.message)
				if tc.listed {
					require.Len(t, stream.message.Reports, 1)
					require.Equal(t, "shared", stream.message.Reports[0].Id)
					require.True(t, stream.message.Reports[0].HasDirectAccess)
					require.Equal(t, []proto.ConnectionType{proto.ConnectionType_CONNECTION_TYPE_BIGQUERY}, stream.message.Reports[0].ConnectionTypes)
				} else {
					require.Empty(t, stream.message.Reports)
				}
			}
			for _, member := range []struct{ email, workspace string }{
				{"unshared@example.com", "delete-me"},
				{"outsider@example.com", "other"},
			} {
				memberCtx := context.WithValue(ctx, user.ContextKey, &user.Claims{Email: member.email})
				memberCtx = user.SetWorkspaceCtx(memberCtx, user.WorkspaceInfo{ID: member.workspace, UserRole: proto.UserRole_ROLE_EDITOR})
				stream := &reportListTestStream{}
				require.NoError(t, s.sendReportList(memberCtx, stream, 1))
				require.Empty(t, stream.message.Reports)
			}
			// Public maps remain openable even when their connection cannot serve other people.
			if tc.name == "connection cannot serve others" {
				_, err = s.db.Exec(`UPDATE reports SET is_public=true WHERE id='shared'`)
				require.NoError(t, err)
				memberCtx := context.WithValue(ctx, user.ContextKey, &user.Claims{Email: "member@example.com"})
				memberCtx = user.SetWorkspaceCtx(memberCtx, user.WorkspaceInfo{ID: "delete-me", UserRole: proto.UserRole_ROLE_EDITOR})
				stream := &reportListTestStream{}
				require.NoError(t, s.sendReportList(memberCtx, stream, 1))
				require.Len(t, stream.message.Reports, 1)
				require.Equal(t, "shared", stream.message.Reports[0].Id)
				require.Equal(t, []proto.ConnectionType{proto.ConnectionType_CONNECTION_TYPE_BIGQUERY}, stream.message.Reports[0].ConnectionTypes)
			}
		})
	}
}
