package pgjob

import "testing"

const (
	zeroXY        = "00000000000000000000000000000000"
	nanCoordinate = "000000000000f87f"
)

func TestNormalizeEWKBHexIssue280(t *testing.T) {
	input := "0106000020E610000001000000010300000001000000040000009A99999999992A400000000000404A40CDCCCCCCCCCC2A400000000000404A40CDCCCCCCCCCC2A40CDCCCCCCCC4C4A409A99999999992A400000000000404A40"
	want := "010600000001000000010300000001000000040000009a99999999992a400000000000404a40cdcccccccccc2a400000000000404a40cdcccccccccc2a40cdcccccccc4c4a409a99999999992a400000000000404a40"

	if got := normalizeEWKBHex(input); got != want {
		t.Fatalf("normalizeEWKBHex() = %q, want %q", got, want)
	}
}

func TestNormalizeEWKBHexSupportedGeometryFamilies(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "point",
			input: "0101000020e6100000" + zeroXY,
			want:  "0101000000" + zeroXY,
		},
		{
			name:  "line string",
			input: "0102000020e610000001000000" + zeroXY,
			want:  "010200000001000000" + zeroXY,
		},
		{
			name:  "polygon",
			input: "0103000020e61000000100000001000000" + zeroXY,
			want:  "01030000000100000001000000" + zeroXY,
		},
		{
			name:  "multi point",
			input: "0104000020e6100000010000000101000000" + zeroXY,
			want:  "0104000000010000000101000000" + zeroXY,
		},
		{
			name:  "multi line string",
			input: "0105000020e610000001000000010200000000000000",
			want:  "010500000001000000010200000000000000",
		},
		{
			name:  "empty multi polygon",
			input: "0106000020e610000000000000",
			want:  "010600000000000000",
		},
		{
			name:  "mixed endian multi point",
			input: "0104000020e61000000100000000000000013ff00000000000004000000000000000",
			want:  "01040000000100000000000000013ff00000000000004000000000000000",
		},
		{
			name:  "XYZ",
			input: "01010000a0e6100000" + nanCoordinate + nanCoordinate + nanCoordinate,
			want:  "01e9030000" + nanCoordinate + nanCoordinate + nanCoordinate,
		},
		{
			name:  "XYM",
			input: "0101000060e6100000" + nanCoordinate + nanCoordinate + nanCoordinate,
			want:  "01d1070000" + nanCoordinate + nanCoordinate + nanCoordinate,
		},
		{
			name:  "XYZM",
			input: "01010000e0e6100000" + nanCoordinate + nanCoordinate + nanCoordinate + nanCoordinate,
			want:  "01b90b0000" + nanCoordinate + nanCoordinate + nanCoordinate + nanCoordinate,
		},
		{
			name:  "multi point with empty member",
			input: "0104000020e6100000010000000101000000" + nanCoordinate + nanCoordinate,
			want:  "0104000000010000000101000000" + nanCoordinate + nanCoordinate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeEWKBHex(tt.input); got != tt.want {
				t.Fatalf("normalizeEWKBHex() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNormalizeEWKBHexLeavesUnsupportedValuesUnchanged(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{name: "text", input: "hello"},
		{name: "ordinary hex", input: "deadbeef"},
		{name: "standard WKB", input: "0101000000" + zeroXY},
		{name: "top-level EPSG 2154", input: "01010000206a080000" + zeroXY},
		{name: "nested EPSG 2154", input: "0104000020e61000000100000001010000206a080000" + zeroXY},
		{name: "truncated SRID", input: "0101000020e610"},
		{name: "trailing bytes", input: "0101000020e6100000" + zeroXY + "00"},
		{name: "excessive point count", input: "0102000020e6100000ffffffff"},
		{name: "wrong multi child type", input: "0104000020e610000001000000010200000000000000"},
		{name: "wrong multi child dimensions", input: "01040000a0e6100000010000000101000000" + zeroXY},
		{name: "geometry collection", input: "0107000020e610000000000000"},
		{name: "curve type", input: "0108000020e610000000000000"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeEWKBHex(tt.input); got != tt.input {
				t.Fatalf("normalizeEWKBHex() = %q, want unchanged %q", got, tt.input)
			}
		})
	}
}

func FuzzNormalizeEWKBHex(f *testing.F) {
	f.Add("0101000020e6100000" + zeroXY)
	f.Add("0104000020e61000000100000001010000206a080000" + zeroXY)
	f.Add("not geometry")

	f.Fuzz(func(t *testing.T, value string) {
		_ = normalizeEWKBHex(value)
	})
}

func BenchmarkNormalizeEWKBHexOrdinaryValue(b *testing.B) {
	value := "a non-geometry PostgreSQL result that should be rejected from its short prefix"
	for b.Loop() {
		normalizeEWKBHex(value)
	}
}
