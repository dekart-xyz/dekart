package secrets

import (
	"context"
	"database/sql"
	"dekart/src/server/jwtkeys"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestInit_WithBootstrapFallbackEnablesServerEncryptDecrypt(t *testing.T) {
	t.Setenv("DEKART_DATA_ENCRYPTION_KEY", "")
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		create table instance_keys (
			id text primary key,
			key_name text not null unique,
			private_key_pem text not null,
			public_key_pem text not null,
			created_at datetime not null default current_timestamp
		);
	`)
	if err != nil {
		t.Fatalf("create schema: %v", err)
	}

	_, err = jwtkeys.EnsureBootstrapKeyInMemory(context.Background(), db)
	if err != nil {
		t.Fatalf("EnsureBootstrapKeyInMemory: %v", err)
	}
	Init()

	enc, err := ServerEncrypt("secret-value")
	if err != nil {
		t.Fatalf("ServerEncrypt: %v", err)
	}
	dec, err := ServerDecrypt(enc)
	if err != nil {
		t.Fatalf("ServerDecrypt: %v", err)
	}
	if dec != "secret-value" {
		t.Fatalf("unexpected plaintext: %q", dec)
	}
}
