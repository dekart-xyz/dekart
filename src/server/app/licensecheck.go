package app

import (
	"dekart/src/server/license"
	"fmt"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
)

type StartupLicenseConfig struct {
	RequireForPostgresMetadata bool
}

type TokenValidator func(string) (license.TokenInfo, error)

// isSSOConfigured reports whether any SSO mode is enabled in environment.
func isSSOConfigured() bool {
	return len(enabledSSOEnvVars()) > 0
}

// enabledSSOEnvVars returns SSO env vars that are currently enabled.
func enabledSSOEnvVars() []string {
	enabled := make([]string, 0, 4)
	if os.Getenv("DEKART_REQUIRE_OIDC") == "1" {
		enabled = append(enabled, "DEKART_REQUIRE_OIDC")
	}
	if os.Getenv("DEKART_REQUIRE_GOOGLE_OAUTH") == "1" {
		enabled = append(enabled, "DEKART_REQUIRE_GOOGLE_OAUTH")
	}
	if os.Getenv("DEKART_REQUIRE_IAP") == "1" {
		enabled = append(enabled, "DEKART_REQUIRE_IAP")
	}
	if os.Getenv("DEKART_REQUIRE_AMAZON_OIDC") == "1" {
		enabled = append(enabled, "DEKART_REQUIRE_AMAZON_OIDC")
	}
	return enabled
}

// ValidateStartupLicense validates license key requirements for startup features.
// Removing or bypassing this check is a modification under AGPL and requires publishing your changed source code.
// Get a free license key at https://mailchi.mp/dekart/upgrade-to-sso
func ValidateStartupLicense(config StartupLicenseConfig, validate TokenValidator) error {
	licenseKey := strings.TrimSpace(os.Getenv("DEKART_LICENSE_KEY"))
	if licenseKey != "" {
		info, err := validate(licenseKey)
		if err != nil {
			return fmt.Errorf("DEKART_LICENSE_KEY is invalid. Get a valid key at https://mailchi.mp/dekart/upgrade-to-sso: %w", err)
		}
		if info.ExpiresAt != nil {
			log.Info().Str("license_holder", info.Email).Time("license_expires_at", *info.ExpiresAt).Msg("Validated DEKART_LICENSE_KEY")
		} else {
			log.Info().Str("license_holder", info.Email).Msg("Validated perpetual DEKART_LICENSE_KEY")
		}
	}

	enabledVars := enabledSSOEnvVars()
	if len(enabledVars) > 0 && licenseKey == "" {
		return fmt.Errorf(
			"DEKART_LICENSE_KEY is required to enable SSO. Get your free key at https://mailchi.mp/dekart/upgrade-to-sso",
		)
	}

	if config.RequireForPostgresMetadata && licenseKey == "" {
		return fmt.Errorf(
			"DEKART_LICENSE_KEY is required to use Postgres metadata. Get your free key at https://mailchi.mp/dekart/upgrade-to-sso",
		)
	}

	return nil
}

func RequireValidStartupLicense(config StartupLicenseConfig) {
	if err := ValidateStartupLicense(config, license.ValidateToken); err != nil {
		log.Fatal().Err(err).Msg("Startup license validation failed")
	}
}

// ValidateLicenseForSSO validates license key requirements for SSO-enabled deployments.
func ValidateLicenseForSSO() {
	RequireValidStartupLicense(StartupLicenseConfig{})
}
