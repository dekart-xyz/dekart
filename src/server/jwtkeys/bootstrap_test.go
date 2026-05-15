package jwtkeys

import (
	"context"
	"database/sql"
	"sync"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func prepareBootstrapTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", "file:bootstrap_test?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
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
	return db
}

func TestEnsureActiveBootstrapKey_CreatesWhenMissing(t *testing.T) {
	db := prepareBootstrapTestDB(t)
	defer db.Close()

	priv, pub, created, err := EnsureActiveBootstrapKey(context.Background(), db)
	if err != nil {
		t.Fatalf("EnsureActiveBootstrapKey: %v", err)
	}
	if !created {
		t.Fatal("expected key to be created")
	}
	if len(priv) == 0 || len(pub) == 0 {
		t.Fatal("expected non-empty keypair")
	}
}

func TestEnsureActiveBootstrapKey_ReturnsExisting(t *testing.T) {
	db := prepareBootstrapTestDB(t)
	defer db.Close()

	priv1, pub1, _, err := EnsureActiveBootstrapKey(context.Background(), db)
	if err != nil {
		t.Fatalf("EnsureActiveBootstrapKey first: %v", err)
	}
	priv2, pub2, created2, err := EnsureActiveBootstrapKey(context.Background(), db)
	if err != nil {
		t.Fatalf("EnsureActiveBootstrapKey second: %v", err)
	}
	if created2 {
		t.Fatal("did not expect new key creation")
	}
	if string(priv1) != string(priv2) || string(pub1) != string(pub2) {
		t.Fatal("expected same active keypair")
	}
}

func TestEnsureActiveBootstrapKey_ConcurrentSingleActiveKey(t *testing.T) {
	db := prepareBootstrapTestDB(t)
	defer db.Close()

	const workers = 8
	var wg sync.WaitGroup
	errCh := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, _, err := EnsureActiveBootstrapKey(context.Background(), db)
			if err != nil {
				errCh <- err
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			t.Fatalf("EnsureActiveBootstrapKey concurrent error: %v", err)
		}
	}

	var count int
	if err := db.QueryRow(`select count(*) from instance_keys where key_name=?`, bootstrapKeyName).Scan(&count); err != nil {
		t.Fatalf("count active: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 bootstrap key row, got %d", count)
	}
}
