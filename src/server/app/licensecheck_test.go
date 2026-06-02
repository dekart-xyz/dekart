package app

import (
	"dekart/src/server/license"
	"errors"
	"os"
	"strings"
	"testing"
)

func clearStartupLicenseEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"DEKART_LICENSE_KEY",
		"DEKART_REQUIRE_OIDC",
		"DEKART_REQUIRE_GOOGLE_OAUTH",
		"DEKART_REQUIRE_IAP",
		"DEKART_REQUIRE_AMAZON_OIDC",
	} {
		key := key
		value, ok := os.LookupEnv(key)
		os.Unsetenv(key)
		t.Cleanup(func() {
			if ok {
				os.Setenv(key, value)
			} else {
				os.Unsetenv(key)
			}
		})
	}
}

func validTestLicense(string) (license.TokenInfo, error) {
	return license.TokenInfo{Email: "test@example.com"}, nil
}

func invalidTestLicense(string) (license.TokenInfo, error) {
	return license.TokenInfo{}, errors.New("bad key")
}

func TestValidateStartupLicenseAllowsSQLiteWithoutKey(t *testing.T) {
	clearStartupLicenseEnv(t)

	err := ValidateStartupLicense(StartupLicenseConfig{}, validTestLicense)

	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestValidateStartupLicenseRequiresKeyForPostgresMetadata(t *testing.T) {
	clearStartupLicenseEnv(t)

	err := ValidateStartupLicense(StartupLicenseConfig{RequireForPostgresMetadata: true}, validTestLicense)

	if err == nil || !strings.Contains(err.Error(), "Postgres metadata") {
		t.Fatalf("expected Postgres metadata license error, got %v", err)
	}
}

func TestValidateStartupLicenseRejectsInvalidKeyForSQLite(t *testing.T) {
	clearStartupLicenseEnv(t)
	os.Setenv("DEKART_LICENSE_KEY", "invalid")

	err := ValidateStartupLicense(StartupLicenseConfig{}, invalidTestLicense)

	if err == nil || !strings.Contains(err.Error(), "invalid") {
		t.Fatalf("expected invalid license error, got %v", err)
	}
}

func TestValidateStartupLicenseAllowsPostgresMetadataWithValidKey(t *testing.T) {
	clearStartupLicenseEnv(t)
	os.Setenv("DEKART_LICENSE_KEY", "valid")

	err := ValidateStartupLicense(StartupLicenseConfig{RequireForPostgresMetadata: true}, validTestLicense)

	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestValidateStartupLicenseRequiresKeyForSSO(t *testing.T) {
	clearStartupLicenseEnv(t)
	os.Setenv("DEKART_REQUIRE_OIDC", "1")

	err := ValidateStartupLicense(StartupLicenseConfig{}, validTestLicense)

	if err == nil || !strings.Contains(err.Error(), "SSO") {
		t.Fatalf("expected SSO license error, got %v", err)
	}
}
