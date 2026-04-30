package user

import "testing"

func TestCompanyDomainFromEmail(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		email   string
		want    string
		wantErr bool
	}{
		{
			name:  "normal corporate domain",
			email: "alice@acme.com",
			want:  "acme.com",
		},
		{
			name:  "subdomain normalized to etld plus one",
			email: "alice@eu.ops.acme.co.uk",
			want:  "acme.co.uk",
		},
		{
			name:  "display name format",
			email: "Alice Doe <alice@example.org>",
			want:  "example.org",
		},
		{
			name:  "wildcard public suffix domain fallback",
			email: "person@college.sch.uk",
			want:  "college.sch.uk",
		},
		{
			name:    "invalid email",
			email:   "not-an-email",
			wantErr: true,
		},
		{
			name:    "missing domain",
			email:   "alice@",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := CompanyDomainFromEmail(tt.email)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("unexpected domain: got %q want %q", got, tt.want)
			}
		})
	}
}

func TestIsFreeEmailDomain(t *testing.T) {
	t.Parallel()

	if !isFreeEmailDomain("gmail.com") {
		t.Fatal("gmail.com should be recognized as free domain")
	}
	if !isFreeEmailDomain("  GMAIL.COM  ") {
		t.Fatal("domain normalization should be case-insensitive")
	}
	if isFreeEmailDomain("acme.com") {
		t.Fatal("acme.com should not be recognized as free domain")
	}
	if isFreeEmailDomain("mit.edu") {
		t.Fatal("mit.edu should not be recognized as free domain")
	}
}

func TestIsFreeEmailAddress(t *testing.T) {
	t.Parallel()

	if !isFreeEmailAddress("person@sub.gmail.com") {
		t.Fatal("sub.gmail.com should normalize to free provider")
	}
	if isFreeEmailAddress("person@maps.acme.com") {
		t.Fatal("maps.acme.com should not be recognized as free provider")
	}
	if isFreeEmailAddress("broken-email") {
		t.Fatal("invalid email should not be recognized as free provider")
	}
}

func TestIsEducationalDomain(t *testing.T) {
	t.Parallel()
	tests := []struct {
		domain string
		want   bool
	}{
		{domain: "harvard.edu", want: true},
		{domain: "ox.ac.uk", want: true},
		{domain: "uni.edu.au", want: true},
		{domain: "college.sch.uk", want: true},
		{domain: "school.pvt.k12.ma.us", want: true},
		{domain: "foo.k12.ca.us", want: true},
		{domain: "acme.com", want: false},
		{domain: "ac.com", want: false},
		{domain: "gmail.com", want: false},
		{domain: "not-a-domain", want: false},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.domain, func(t *testing.T) {
			t.Parallel()
			got := isEducationalDomain(tt.domain)
			if got != tt.want {
				t.Fatalf("unexpected IsEducationalDomain(%q): got %v want %v", tt.domain, got, tt.want)
			}
		})
	}
}

func TestIsEducationalEmailAddress(t *testing.T) {
	t.Parallel()

	if !isEducationalEmailAddress("person@harvard.edu") {
		t.Fatal("harvard.edu should be recognized as educational")
	}
	if !isEducationalEmailAddress("person@dept.ox.ac.uk") {
		t.Fatal("ox.ac.uk should be recognized as educational")
	}
	if isEducationalEmailAddress("person@gmail.com") {
		t.Fatal("gmail.com should not be recognized as educational")
	}
	if isEducationalEmailAddress("broken-email") {
		t.Fatal("invalid email should not be recognized as educational")
	}
}

func TestIsCompanyEmail(t *testing.T) {
	t.Parallel()
	tests := []struct {
		email string
		want  bool
	}{
		{email: "person@acme.com", want: true},
		{email: "person@maps.acme.co.uk", want: true},
		{email: "person@gmail.com", want: false},
		{email: "person@sub.gmail.com", want: false},
		{email: "person@harvard.edu", want: false},
		{email: "person@dept.ox.ac.uk", want: false},
		{email: "broken-email", want: false},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.email, func(t *testing.T) {
			t.Parallel()
			if got := IsCompanyEmail(tt.email); got != tt.want {
				t.Fatalf("unexpected IsCompanyEmail(%q): got %v want %v", tt.email, got, tt.want)
			}
		})
	}
}
