package dekart

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/user"
	"os"

	"github.com/lib/pq"
)

// checkCreateReportGate evaluates whether creating a report should be blocked by trial gate policy.
func (s Server) checkCreateReportGate(ctx context.Context, claimsEmail string, workspaceInfo user.WorkspaceInfo) (bool, int, []string, error) {
	if os.Getenv("DEKART_CLOUD") == "" {
		return true, 0, nil, nil
	}
	if workspaceInfo.IsPlayground || workspaceInfo.IsDefaultWorkspace {
		return true, 0, nil, nil
	}
	if workspaceInfo.PlanType != proto.PlanType_TYPE_PERSONAL && !workspaceInfo.Expired {
		return true, 0, nil, nil
	}
	companyDomain, err := user.CompanyDomainFromEmail(claimsEmail)
	if err != nil {
		return true, 0, nil, nil
	}
	if !user.IsCompanyEmail(claimsEmail) {
		return true, 0, nil, nil
	}

	workspaceCount, isFirstWorkspace, owners, err := s.getCompanyWorkspaceStats(ctx, companyDomain, workspaceInfo.ID)
	if err != nil {
		return false, 0, nil, err
	}
	if workspaceCount <= 1 {
		return true, workspaceCount, nil, nil
	}
	if isFirstWorkspace {
		return true, workspaceCount, nil, nil
	}

	mapsCount, err := s.countWorkspaceMaps(ctx, workspaceInfo.ID)
	if err != nil {
		return false, workspaceCount, nil, err
	}
	if mapsCount >= 2 {
		return false, workspaceCount, owners, nil
	}
	return true, workspaceCount, nil, nil
}

// getCompanyWorkspaceStats returns company workspace count, whether current workspace is first, and owner/admin emails.
func (s Server) getCompanyWorkspaceStats(ctx context.Context, companyDomain string, workspaceID string) (int, bool, []string, error) {
	const q = `
		WITH latest_workspace_log AS (
			SELECT wl.workspace_id, wl.email, wl.authored_by, wl.role, wl.status, wl.id, wl.created_at
			FROM workspace_log wl
			JOIN (
				SELECT workspace_id, email, MAX(created_at) AS created_at
				FROM workspace_log
				GROUP BY workspace_id, email
			) ll ON ll.workspace_id = wl.workspace_id AND ll.email = wl.email AND ll.created_at = wl.created_at
		),
		active_company_members AS (
			SELECT lwl.workspace_id, lwl.email, lwl.authored_by, lwl.role, lwl.created_at
			FROM latest_workspace_log lwl
			LEFT JOIN confirmation_log cl ON cl.workspace_log_id = lwl.id AND cl.authored_by = lwl.email
			WHERE lwl.status = 1
				AND (
					lwl.authored_by = lwl.email
					OR cl.accepted = TRUE
					OR lwl.role = 1
				)
		),
		company_workspaces AS (
			SELECT DISTINCT acm.workspace_id
			FROM active_company_members acm
			WHERE
				split_part(lower(acm.email), '@', 2) = $1
				OR split_part(lower(acm.email), '@', 2) LIKE '%.' || $1
		)
		SELECT
			COUNT(DISTINCT cw.workspace_id) AS workspace_count,
			COALESCE((
				SELECT cw2.workspace_id = $2
				FROM company_workspaces cw2
				JOIN workspaces w ON w.id = cw2.workspace_id
				ORDER BY w.created_at ASC
				LIMIT 1
			), FALSE) AS is_first_workspace,
			COALESCE((
				SELECT array_agg(DISTINCT acm2.email ORDER BY acm2.email)
				FROM active_company_members acm2
				WHERE acm2.workspace_id IN (SELECT workspace_id FROM company_workspaces)
				  AND acm2.role = 1
			), '{}'::text[]) AS owner_emails
		FROM company_workspaces cw
	`
	var workspaceCount int
	var isFirstWorkspace bool
	var owners []string
	if err := s.db.QueryRowContext(ctx, q, companyDomain, workspaceID).Scan(&workspaceCount, &isFirstWorkspace, pq.Array(&owners)); err != nil {
		return 0, false, nil, err
	}
	return workspaceCount, isFirstWorkspace, owners, nil
}

// countWorkspaceMaps returns number of non-archived non-playground reports in workspace.
func (s Server) countWorkspaceMaps(ctx context.Context, workspaceID string) (int, error) {
	const q = `
		SELECT COUNT(*)
		FROM reports
		WHERE workspace_id = $1
		  AND archived = FALSE
		  AND is_playground = FALSE
	`
	var count int
	if err := s.db.QueryRowContext(ctx, q, workspaceID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}
