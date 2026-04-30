// PROVENANCE
// authoring: ai-generated

package user

import (
	"fmt"
	"net/mail"
	"strings"

	workemailvalidator "github.com/qeeqez/work-email-validator"
	"golang.org/x/net/publicsuffix"
)

var educationalSuffixLabels = map[string]struct{}{
	"edu": {},
	"ac":  {},
	"sch": {},
	"k12": {},
}

// CompanyDomainFromEmail extracts normalized company domain from email address.
// It prefers eTLD+1 and falls back to the full domain for wildcard PSL suffixes.
func CompanyDomainFromEmail(email string) (string, error) {
	addr, err := mail.ParseAddress(strings.TrimSpace(email))
	if err != nil {
		return "", fmt.Errorf("invalid email address: %w", err)
	}
	at := strings.LastIndex(addr.Address, "@")
	if at < 0 || at == len(addr.Address)-1 {
		return "", fmt.Errorf("email does not contain domain")
	}
	domain := strings.ToLower(strings.TrimSpace(addr.Address[at+1:]))
	if domain == "" {
		return "", fmt.Errorf("email domain is empty")
	}
	etld1, err := publicsuffix.EffectiveTLDPlusOne(domain)
	if err != nil {
		suffix, _ := publicsuffix.PublicSuffix(domain)
		if suffix == "" {
			return "", fmt.Errorf("cannot normalize email domain %q: %w", domain, err)
		}
		return domain, nil
	}
	return etld1, nil
}

func isFreeEmailDomain(domain string) bool {
	normalized, _, err := normalizeDomain(domain)
	if err != nil {
		return false
	}
	return workemailvalidator.IsFreeDomain(normalized)
}

func isEducationalDomain(domain string) bool {
	normalized := strings.ToLower(strings.TrimSpace(domain))
	if normalized == "" {
		return false
	}
	normalized = strings.TrimSuffix(normalized, ".")
	suffix, _ := publicsuffix.PublicSuffix(normalized)
	if suffix == "" {
		return false
	}
	suffix = strings.ToLower(strings.TrimSpace(suffix))
	if suffix == "" {
		return false
	}
	for _, label := range strings.Split(suffix, ".") {
		if _, ok := educationalSuffixLabels[label]; ok {
			return true
		}
	}
	return false
}

func isFreeEmailAddress(email string) bool {
	domain, err := CompanyDomainFromEmail(email)
	if err != nil {
		return false
	}
	return isFreeEmailDomain(domain)
}

func isEducationalEmailAddress(email string) bool {
	domain, err := CompanyDomainFromEmail(email)
	if err != nil {
		return false
	}
	return isEducationalDomain(domain)
}

// IsCompanyEmail returns true for business/company emails and false for free/disposable/educational/invalid emails.
func IsCompanyEmail(email string) bool {
	if !workemailvalidator.IsWorkEmail(strings.TrimSpace(email)) {
		return false
	}
	if isEducationalEmailAddress(email) {
		return false
	}
	return true
}

func normalizeDomain(domain string) (string, string, error) {
	normalized := strings.ToLower(strings.TrimSpace(domain))
	if normalized == "" {
		return "", "", fmt.Errorf("domain is empty")
	}
	normalized = strings.TrimSuffix(normalized, ".")
	etld1, err := publicsuffix.EffectiveTLDPlusOne(normalized)
	if err != nil {
		suffix, _ := publicsuffix.PublicSuffix(normalized)
		suffix = strings.ToLower(strings.TrimSpace(suffix))
		if suffix == "" {
			return "", "", fmt.Errorf("cannot normalize domain %q: %w", normalized, err)
		}
		return normalized, suffix, nil
	}
	suffix, _ := publicsuffix.PublicSuffix(etld1)
	suffix = strings.ToLower(strings.TrimSpace(suffix))
	if suffix == "" {
		return "", "", fmt.Errorf("domain suffix is empty")
	}
	return etld1, suffix, nil
}
