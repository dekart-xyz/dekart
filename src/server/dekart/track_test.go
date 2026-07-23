package dekart

import "testing"

func TestNormalizeTelemetryID(t *testing.T) {
	tests := []struct {
		name         string
		value        string
		want         string
		wantExcluded bool
	}{
		{
			name:  "normalizes valid uuid4",
			value: "8B532020-1838-4D13-BBEA-54F8B1022EA5",
			want:  "8b532020-1838-4d13-bbea-54f8b1022ea5",
		},
		{
			name:  "discards malformed uuid",
			value: "not-a-uuid",
		},
		{
			name:  "discards non-v4 uuid",
			value: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
		},
		{
			name:         "excludes reserved ci uuid",
			value:        CITelemetryID,
			wantExcluded: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, excluded := normalizeTelemetryID(tc.value)
			if got != tc.want || excluded != tc.wantExcluded {
				t.Fatalf("normalizeTelemetryID(%q) = (%q, %t), want (%q, %t)", tc.value, got, excluded, tc.want, tc.wantExcluded)
			}
		})
	}
}
