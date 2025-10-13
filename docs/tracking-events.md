# Tracking Events Documentation

Complete list of tracking events used in the Dekart application via `track()` function (Plausible Analytics integration).

## File Upload Events

- **FileSelected** - User selects a file (fileSize, fileType)
- **ClickUploadFile** - User clicks Upload button (fileId)
- **FileUploadStarted** - Upload begins (fileId, fileSize)
- **FileUploadCompleted** - Upload succeeds (fileId)
- **FileUploadFailed** - Upload fails (fileId, status)
- **FileSizeError** - File exceeds size limit (uerror)
- **FileUploadError** - Upload error occurs (message, fileId)
- **CreateFile** - New file dataset created

## Query Events

- **QueryExecute** - User runs a query (queryId)
- **QueryCancelled** - User cancels query (jobId)
- **QueryError** - Query execution fails (queryId, uerror, jobId)
- **QuerySuccess** - Query succeeds (queryId, jobId, bytesProcessed)
- **SampleQueryClicked** - User clicks sample query (queryId)
- **CopyErrorToClipboard** - User copies error (queryId)
- **RefreshAllQueries** - User re-runs all queries

## Report Events

- **ReportPageViewed** - User views report (reportId, edit)
- **ReportTitleEditClicked** - User clicks to edit title
- **ReportTitleChanged** - User changes title
- **AddDatasetTab** - User adds dataset tab (reportId)
- **SwitchDatasetTab** - User switches tabs (datasetId, reportId)
- **ViewReadmeTab** - User views README (reportId)
- **RemoveDataset** - User removes dataset (datasetId)
- **OpenDatasetSettings** - User opens settings (datasetId)
- **RemoveReadmeClicked** - User clicks remove README (reportId)
- **RemoveReadmeConfirmed** - User confirms removal (reportId)
- **ToggleFullscreen** - User toggles fullscreen
- **ForkReport** - User forks report (reportId)
- **ForkReportNoWorkspace** - Fork attempt without workspace (reportId)
- **SaveMap** - User saves map
- **SwitchToEditMode** - Switch to edit mode (reportId)
- **SwitchToViewMode** - Switch to view mode (reportId)
- **PublishReportChanged** - Publish status changed
- **TrackViewersChanged** - Viewer tracking toggled
- **OpenShareModal** - Share modal opened
- **OpenAnalyticsModal** - Analytics modal opened

## Navigation Events

- **NavigateToMyMaps** - Navigate to My Maps
- **NavigateToSharedMaps** - Navigate to Shared Maps
- **NavigateToMaps** - Navigate to Maps (no auth)
- **NavigateToConnections** - Navigate to Connections
- **CreateNewMap** - New Map clicked
- **ClickedOvertureMapsGPT** - Overture Maps GPT link
- **ClickedMapExamples** - Map Examples link
- **ClickedAskInSlack** - Slack link
- **ClickedReportIssue** - GitHub Issues link
- **ClickedGitHubStar** - GitHub repo link

## Dataset Events

- **ClickUploadFileOption** - Upload File option clicked in dataset selector (datasetId)
- **ClickWriteReadme** - Write README clicked (datasetId)
- **CreateQueryFromConnection** - Query created (datasetId, connectionId, connectionType)
- **AddConnectionFromDatasetSelector** - Add connection clicked
- **AddAndEditConnections** - Edit connections link
- **AddReadme** - README added

## Connection Events

- **ConnectionTypeSelector** - Connection selector displayed
- **ConnectionTypeSelectorBigQuery** - BigQuery selected
- **ConnectionTypeSelectorSnowflake** - Snowflake selected
- **ConnectionTypeSelectorWherobots** - Wherobots selected
- **TestConnection** - Test Connection clicked
- **TestConnectionSuccess** - Connection test succeeds
- **TestConnectionError** - Connection test fails
- **SaveConnection** - Connection saved
- **BigQueryServiceAccountConnectionModal** - Service account modal shown
- **BigQueryConnectionModal** - BigQuery modal shown
- **AutoFillBigQueryProjectId** - Project ID auto-filled
- **OpenBigQueryConnectionTypeSelectorModal** - Type selector opened
- **ConnectWithGoogle** - Google OAuth selected
- **ConnectWithServiceAccount** - Service account selected

## Export Events

- **ExportMap** - Map export
- **ExportData** - Data export
- **ExportImage** - Image export

## User & Workspace Events

- **ManageWorkspace** - Manage workspace clicked
- **SwitchToWorkspace** - Switch to workspace from playground
- **WorkspaceButtonClicked** - Workspace button clicked
- **SwitchToPrivateWorkspace** - Switch from playground
- **SwitchAccount** - User switches account
- **SignOut** - User signs out
- **WelcomeScreen** - Welcome screen shown
- **CreateWorkspace** - Create workspace clicked
- **CreateWorkspaceFormFinish** - Workspace form submitted
- **CreateWorkspaceFormSource[Type]** - Workspace source selected
- **SubscriptionTabOpened** - Subscription tab opened
- **RequestSensitiveScopes** - Sensitive scopes requested

## Message Events

- **SuccessMessage** - Success message shown
- **InfoMessage** - Info message shown
- **WarnMessage** - Warning shown (transitive)

## Error Events

- **setError** - General system error (message)
- **setHttpError** - HTTP error (status, message)
- **setStreamError** - Stream error (status, message)
- **KeplerError** - Kepler.gl error (message)

## Modal Events

- **UpgradeModalOpened[Type]** - Upgrade modal opened
- **UpgradeModalClosed** - Upgrade modal closed

## Onboarding Events

- **ForkOnboarding** - Fork onboarding shown
- **ForkOnboardingStart** - Fork onboarding started
- **CreateWorkspaceFromForkOnboarding** - Workspace created from onboarding

---

**Total Events:** 92+

**Privacy:** Email addresses are hashed (SHA256, first 8 bytes) before tracking. File names and user-entered content are not tracked.

**Error Tracking:**
- `message` - System errors (network, server, internal errors)
- `uerror` - User errors (SQL errors, validation errors, user input issues)

**Backend:** Plausible Analytics

**Implementation:** `src/client/lib/tracking.js`
