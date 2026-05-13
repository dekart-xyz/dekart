// @author: assistant
package jwtkeys

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"database/sql"
	"encoding/pem"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

const bootstrapKeyName = "bootstrap_root"

var (
	bootstrapKeyMu         sync.RWMutex
	bootstrapPrivateKeyPEM []byte
	bootstrapPublicKeyPEM  []byte
)

// GetActiveBootstrapKey returns bootstrap keypair from instance_keys.
func GetActiveBootstrapKey(ctx context.Context, db *sql.DB) ([]byte, []byte, error) {
	var privateKeyPEM string
	var publicKeyPEM string
	err := db.QueryRowContext(ctx,
		`select private_key_pem, public_key_pem
		from instance_keys
		where key_name=$1
		order by created_at desc
		limit 1`,
		bootstrapKeyName,
	).Scan(&privateKeyPEM, &publicKeyPEM)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, sql.ErrNoRows
		}
		return nil, nil, err
	}
	return []byte(privateKeyPEM), []byte(publicKeyPEM), nil
}

// EnsureActiveBootstrapKey returns bootstrap keypair, creating one when absent.
func EnsureActiveBootstrapKey(ctx context.Context, db *sql.DB) ([]byte, []byte, bool, error) {
	privateKeyPEM, publicKeyPEM, err := GetActiveBootstrapKey(ctx, db)
	if err == nil {
		return privateKeyPEM, publicKeyPEM, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, false, err
	}

	privateGenerated, publicGenerated, err := generateBootstrapKeyPair()
	if err != nil {
		return nil, nil, false, err
	}

	created, err := insertBootstrapKeyIfMissing(ctx, db, privateGenerated, publicGenerated)
	if err != nil {
		return nil, nil, false, err
	}
	if !created {
		privateKeyPEM, publicKeyPEM, err = GetActiveBootstrapKey(ctx, db)
		if err != nil {
			return nil, nil, false, err
		}
		return privateKeyPEM, publicKeyPEM, false, nil
	}
	return privateGenerated, publicGenerated, true, nil
}

// EnsureBootstrapKeyInMemory ensures bootstrap key exists in DB and caches it in memory.
func EnsureBootstrapKeyInMemory(ctx context.Context, db *sql.DB) (bool, error) {
	privateKeyPEM, publicKeyPEM, created, err := EnsureActiveBootstrapKey(ctx, db)
	if err != nil {
		return false, err
	}
	bootstrapKeyMu.Lock()
	bootstrapPrivateKeyPEM = append([]byte(nil), privateKeyPEM...)
	bootstrapPublicKeyPEM = append([]byte(nil), publicKeyPEM...)
	bootstrapKeyMu.Unlock()
	return created, nil
}

// GetBootstrapKeyPairFromMemory returns cached bootstrap keypair.
func GetBootstrapKeyPairFromMemory() ([]byte, []byte, error) {
	bootstrapKeyMu.RLock()
	defer bootstrapKeyMu.RUnlock()
	if len(bootstrapPrivateKeyPEM) == 0 || len(bootstrapPublicKeyPEM) == 0 {
		return nil, nil, errors.New("bootstrap key is not initialized")
	}
	return append([]byte(nil), bootstrapPrivateKeyPEM...), append([]byte(nil), bootstrapPublicKeyPEM...), nil
}

// MustInitBootstrapKey ensures bootstrap key exists in DB and caches it in memory.
// It exits the process on error because bootstrap key is required for startup.
func MustInitBootstrapKey(db *sql.DB) {
	created, err := EnsureBootstrapKeyInMemory(context.Background(), db)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize bootstrap root key")
	}
	if created {
		log.Info().Msg("Created bootstrap root key")
	}
}

func insertBootstrapKeyIfMissing(ctx context.Context, db *sql.DB, privateKeyPEM, publicKeyPEM []byte) (bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var existingID string
	scanErr := tx.QueryRowContext(ctx,
		`select id from instance_keys where key_name=$1 limit 1`,
		bootstrapKeyName,
	).Scan(&existingID)
	if scanErr == nil {
		if err := tx.Commit(); err != nil {
			return false, err
		}
		return false, nil
	}
	if !errors.Is(scanErr, sql.ErrNoRows) {
		return false, scanErr
	}

	id := uuid.NewString()
	_, err = tx.ExecContext(ctx,
		`insert into instance_keys (
			id, key_name, private_key_pem, public_key_pem, created_at
		) values ($1, $2, $3, $4, $5)`,
		id,
		bootstrapKeyName,
		string(privateKeyPEM),
		string(publicKeyPEM),
		time.Now().UTC(),
	)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func generateBootstrapKeyPair() ([]byte, []byte, error) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, fmt.Errorf("generate rsa private key: %w", err)
	}
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})
	publicPKIX, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal rsa public key: %w", err)
	}
	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicPKIX,
	})
	return privateKeyPEM, publicKeyPEM, nil
}
