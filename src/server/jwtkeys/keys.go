package jwtkeys

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt"
)

// ParseRSAPrivateKeyFromPEM parses RSA private keys in PKCS#1 or PKCS#8 format.
func ParseRSAPrivateKeyFromPEM(data []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("invalid PEM block")
	}

	if privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return privateKey, nil
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	privateKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not RSA")
	}
	return privateKey, nil
}

// ParseRSAPublicKeyFromPEM parses RSA public key PEM blocks.
func ParseRSAPublicKeyFromPEM(data []byte) (*rsa.PublicKey, error) {
	publicKey, err := jwt.ParseRSAPublicKeyFromPEM(data)
	if err != nil {
		return nil, fmt.Errorf("parse public key: %w", err)
	}
	return publicKey, nil
}
