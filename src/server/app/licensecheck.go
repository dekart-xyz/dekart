package app

import (
	"dekart/src/server/license"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
)

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

// ValidateLicenseForSSO validates license key requirements for SSO-enabled deployments.
// Removing or bypassing this check is a modification under AGPL and requires publishing your changed source code.
// Get a free license key at https://mailchi.mp/dekart/upgrade-to-sso
func ValidateLicenseForSSO() {
	licenseKey := strings.TrimSpace(os.Getenv("DEKART_LICENSE_KEY"))
	if licenseKey != "" {
		info, err := license.ValidateToken(licenseKey)
		if err != nil {
			log.Fatal().Err(err).Msg("DEKART_LICENSE_KEY is invalid. Get a valid key at https://mailchi.mp/dekart/upgrade-to-sso")
		}
		if info.ExpiresAt != nil {
			log.Info().Str("license_holder", info.Email).Time("license_expires_at", *info.ExpiresAt).Msg("Validated DEKART_LICENSE_KEY")
		} else {
			log.Info().Str("license_holder", info.Email).Msg("Validated perpetual DEKART_LICENSE_KEY")
		}
	}

	enabledVars := enabledSSOEnvVars()
	if len(enabledVars) == 0 {
		return
	}
	if licenseKey == "" {
		log.Fatal().Msg(
			"DEKART_LICENSE_KEY is required to enable SSO. Get your free key at https://mailchi.mp/dekart/upgrade-to-sso",
		)
	}
}
