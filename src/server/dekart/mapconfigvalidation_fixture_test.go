package dekart

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type mapConfigFixture struct {
	Rows []mapConfigFixtureRow `json:"rows"`
}

type mapConfigFixtureRow struct {
	WorkspaceID string   `json:"workspace_id"`
	ReportID    string   `json:"report_id"`
	UpdatedAt   string   `json:"updated_at"`
	DatasetIDs  []string `json:"dataset_ids"`
	MapConfig   string   `json:"map_config"`
}

// TestValidateKeplerMapConfigV1_RecentBQFixtures validates recently exported real-world map configs.
// The fixture is generated offline from BigQuery and this test performs no network calls.
func TestValidateKeplerMapConfigV1_RecentBQFixtures(t *testing.T) {
	fixturePath := filepath.Join("testdata", "recent_map_configs_bq.json")
	payload, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture %s: %v", fixturePath, err)
	}

	var fixture mapConfigFixture
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatalf("unmarshal fixture %s: %v", fixturePath, err)
	}

	if len(fixture.Rows) == 0 {
		t.Fatalf("fixture %s has no rows", fixturePath)
	}

	failures := make([]string, 0)
	for idx, row := range fixture.Rows {
		datasetIDSet := make(map[string]struct{}, len(row.DatasetIDs))
		for _, id := range row.DatasetIDs {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			datasetIDSet[id] = struct{}{}
		}

		issues := validateKeplerMapConfigV1(row.MapConfig, datasetIDSet)
		if len(issues) == 0 {
			continue
		}
		failures = append(failures, fmt.Sprintf(
			"row=%d report_id=%s workspace_id=%s updated_at=%s issues=%s",
			idx,
			row.ReportID,
			row.WorkspaceID,
			row.UpdatedAt,
			strings.Join(issues, " | "),
		))
	}

	if len(failures) > 0 {
		max := min(5, len(failures))
		t.Fatalf("map config validator rejected %d/%d fixture rows. first %d failures:\n%s",
			len(failures), len(fixture.Rows), max, strings.Join(failures[:max], "\n"))
	}
}
