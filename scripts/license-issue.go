package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"dekart/src/server/license"
)

func main() {
	var (
		email          = flag.String("email", "", "license holder email (required)")
		privateKeyPath = flag.String("private-key", "", "path to RSA private key PEM (required)")
		days           = flag.Int("days", 0, "trial duration in days; omit for perpetual")
	)
	flag.Parse()

	if *email == "" {
		fatalf("missing required flag: --email")
	}
	if *privateKeyPath == "" {
		fatalf("missing required flag: --private-key")
	}
	if *days < 0 {
		fatalf("--days must be >= 0")
	}

	privateKeyPEM, err := os.ReadFile(*privateKeyPath)
	if err != nil {
		fatalf("read private key: %v", err)
	}

	now := time.Now().UTC()
	request := license.IssueRequest{
		Email:    *email,
		IssuedAt: now,
	}
	if *days > 0 {
		expiresAt := now.Add(time.Duration(*days) * 24 * time.Hour)
		request.ExpiresAt = &expiresAt
	}

	token, err := license.IssueToken(privateKeyPEM, request)
	if err != nil {
		fatalf("issue token: %v", err)
	}

	fmt.Printf("DEKART_LICENSE_KEY=%s\n", token)
}

func fatalf(format string, values ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", values...)
	os.Exit(1)
}
