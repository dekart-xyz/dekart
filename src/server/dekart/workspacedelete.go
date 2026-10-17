package dekart

import (
	"context"
	"database/sql"
	"fmt"
	"os"

	"dekart/src/proto"
	"dekart/src/server/notifications"
	"dekart/src/server/storage"
	"dekart/src/server/user"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// DeleteWorkspace removes workspace content while retaining its append-only account history.
func (s Server) DeleteWorkspace(ctx context.Context, req *proto.DeleteWorkspaceRequest) (*proto.DeleteWorkspaceResponse, error) {
	claims := user.GetClaims(ctx)
	if claims == nil {
		return nil, Unauthenticated
	}
	workspace := checkWorkspace(ctx)
	// Deletion remains available to admins of expired workspaces, but never to self-hosted users.
	if os.Getenv("DEKART_CLOUD") == "" || workspace.ID == "" || workspace.ID != req.WorkspaceId || workspace.UserRole != proto.UserRole_ROLE_ADMIN {
		return nil, status.Error(codes.PermissionDenied, "Only admins can delete the current Cloud workspace")
	}
	def, err := s.isDefaultWorkspace(ctx, workspace.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if def {
		return nil, status.Error(codes.PermissionDenied, "Cannot delete the default workspace")
	}
	sub, err := s.getSubscription(ctx, workspace.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	// Stripe's active and past_due subscriptions have an ID even when scheduled to cancel.
	if sub != nil && sub.StripeSubscriptionId != "" {
		return nil, status.Error(codes.FailedPrecondition, "Cancel your subscription first")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	defer tx.Rollback()
	var publicStorage storage.Storage
	if os.Getenv("DEKART_CLOUD_STORAGE_BUCKET") != "" || os.Getenv("DEKART_CLOUD_PUBLIC_STORAGE_BUCKET") != "" {
		publicStorage = storage.NewPublicStorage()
	}
	objects, err := s.collectWorkspaceDeleteObjects(ctx, tx, workspace.ID, publicStorage)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	rows, err := tx.QueryContext(ctx, `SELECT email,role FROM (
 SELECT email,role,status,ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC,id DESC) AS row_num
 FROM workspace_log WHERE workspace_id=$1 AND status IN (1,2)) latest WHERE row_num=1 AND status=1`, workspace.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	type member struct {
		email string
		role  int
	}
	members := []member{}
	for rows.Next() {
		var m member
		if err = rows.Scan(&m.email, &m.role); err != nil {
			rows.Close()
			return nil, status.Error(codes.Internal, err.Error())
		}
		members = append(members, m)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	for _, m := range members {
		_, err = tx.ExecContext(ctx, `INSERT INTO workspace_log (id,workspace_id,email,status,authored_by,role) VALUES ($1,$2,$3,2,$4,$5)`, newUUID(), workspace.ID, m.email, claims.Email, m.role)
		if err != nil {
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	if err = s.deleteWorkspaceRows(ctx, tx, workspace.ID, objects.queryIDs); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	retainedConnections, err := s.getRetainedWorkspaceConnections(ctx, tx, workspace.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	for _, id := range objects.fileIDs {
		if _, err = tx.ExecContext(ctx, `DELETE FROM files WHERE id=$1`, id); err != nil {
			return nil, status.Error(codes.Internal, err.Error())
		}
	}
	_, err = tx.ExecContext(ctx, `UPDATE workspaces SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, workspace.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	if err = tx.Commit(); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	s.userStreams.PingAll()
	failed := s.deleteWorkspaceObjects(context.WithoutCancel(ctx), objects)
	// Retained connections also need a report even when every object delete succeeds.
	if len(failed) > 0 || len(retainedConnections) > 0 {
		go s.notifications.SendWorkspaceDeleteCleanupFailed(notifications.WorkspaceDeleteCleanupFailed{WorkspaceID: workspace.ID, WorkspaceName: workspace.Name, RecipientEmail: claims.Email, ObjectURLs: failed, RetainedConnections: retainedConnections})
	}
	return &proto.DeleteWorkspaceResponse{}, nil
}

// deleteWorkspaceRows orders deletes explicitly because Postgres enforces non-cascading foreign keys.
func (s Server) deleteWorkspaceRows(ctx context.Context, tx *sql.Tx, id string, queryIDs []string) error {
	for _, queryID := range queryIDs {
		if _, err := tx.ExecContext(ctx, `DELETE FROM query_jobs WHERE query_id=$1`, queryID); err != nil {
			return err
		}
	}
	for _, table := range []string{"dataset_snapshots", "query_snapshots", "report_snapshots", "map_previews", "report_visit_events", "report_access_log", "report_analytics", "datasets"} {
		predicate := "report_id IN (SELECT id FROM reports WHERE workspace_id=$1)"
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table+" WHERE "+predicate, id); err != nil {
			return err
		}
	}
	for _, queryID := range queryIDs {
		if _, err := tx.ExecContext(ctx, `DELETE FROM queries WHERE id=$1`, queryID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM reports WHERE workspace_id=$1`, id); err != nil {
		return err
	}
	// Surviving datasets and history must keep the connection and its stored credentials.
	_, err := tx.ExecContext(ctx, `DELETE FROM connections WHERE workspace_id=$1
 AND NOT EXISTS (SELECT 1 FROM datasets WHERE connection_id=connections.id)
 AND NOT EXISTS (SELECT 1 FROM dataset_snapshots WHERE connection_id=connections.id)`, id)
	return err
}

// getRetainedWorkspaceConnections describes retained rows without reading credential values.
func (s Server) getRetainedWorkspaceConnections(ctx context.Context, tx *sql.Tx, id string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id,connection_name FROM connections WHERE workspace_id=$1 ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	connections := []string{}
	for rows.Next() {
		var connectionID, name string
		if err := rows.Scan(&connectionID, &name); err != nil {
			return nil, err
		}
		connections = append(connections, fmt.Sprintf("%s (%s)", name, connectionID))
	}
	return connections, rows.Err()
}
