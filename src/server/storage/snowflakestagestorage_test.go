package storage

import "testing"

func TestSnowflakeStageObjectNamePreservesObjectPath(t *testing.T) {
	for _, tc := range []struct {
		name     string
		fileName string
		stage    string
		want     string
	}{
		{
			name:     "legacy root path",
			fileName: "DEKART_DEV.PUBLIC.DEKART_DEV/dekart.db_20260601_120000.backup",
			stage:    "DEKART_DEV.PUBLIC.DEKART_DEV",
			want:     "dekart.db_20260601_120000.backup",
		},
		{
			name:     "quoted stage marker",
			fileName: "@DEKART_DEV.PUBLIC.DEKART_DEV/dekart.db_20260601_120000.backup",
			stage:    "DEKART_DEV.PUBLIC.DEKART_DEV",
			want:     "dekart.db_20260601_120000.backup",
		},
		{
			name:     "native app relative stage path",
			fileName: "app_state_stage/dekart.db_20260601_120000.backup",
			stage:    "app_public.app_state_stage",
			want:     "dekart.db_20260601_120000.backup",
		},
		{
			name:     "native app relative prefixed path",
			fileName: "app_state_stage/sqlite-backups/dekart.db_20260601_120000.backup",
			stage:    "app_public.app_state_stage",
			want:     "sqlite-backups/dekart.db_20260601_120000.backup",
		},
		{
			name:     "already relative root path",
			fileName: "dekart.db_20260601_120000.backup",
			stage:    "app_public.app_state_stage",
			want:     "dekart.db_20260601_120000.backup",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := snowflakeStageObjectName(tc.fileName, tc.stage)
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}
