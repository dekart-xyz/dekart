package secrets

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"dekart/src/proto"
	"dekart/src/server/user"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	secretsmanager "cloud.google.com/go/secretmanager/apiv1"

	"cloud.google.com/go/secretmanager/apiv1/secretmanagerpb"
	"github.com/rs/zerolog/log"
)

// dataEncryptionKey is used to encrypt user sensitive data in database
var dataEncryptionKey []byte

func Init() {
	keyName := os.Getenv("DEKART_DATA_ENCRYPTION_KEY")
	if keyName != "" {
		// Fetch data encryption key from Google Secret Manager
		dataEncryptionKeyStr, err := fetchGoogleSecret(keyName)
		if err != nil {
			log.Fatal().Err(err).Msg("Cannot fetch data encryption key")
		}
		dataEncryptionKey, err = base64.StdEncoding.DecodeString(dataEncryptionKeyStr)
		if err != nil {
			log.Fatal().Err(err).Msg("Cannot decode data encryption key")
		}
	}
	generateClientKeys()
}

// encrypt encrypts plaintext using dataEncryptionKey and returns a single string
// that contains both the base64 encoded ciphertext and IV, separated by a divider.
func ServerEncrypt(plaintext string) (string, error) {
	// Convert plaintext to bytes
	plaintextBytes := []byte(plaintext)

	// Generate a new AES cipher using the key
	block, err := aes.NewCipher(dataEncryptionKey)
	if err != nil {
		return "", err
	}

	// Create a new GCM cipher mode instance
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Generate a random nonce (IV)
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Encrypt the plaintext
	ciphertext := gcm.Seal(nil, nonce, plaintextBytes, nil)

	// Concatenate the base64 encoded ciphertext and nonce (IV) with a divider
	combined := base64.StdEncoding.EncodeToString(ciphertext) + "." + base64.StdEncoding.EncodeToString(nonce)

	return combined, nil
}

// ClientToServer decrypts secret from client and encrypts it for server
func ClientToServer(secret *proto.Secret, claims *user.Claims) *proto.Secret {
	if secret == nil {
		return nil
	}
	if secret.ClientEncrypted == "" {
		return secret
	}
	plaintext := SecretToString(secret, claims)
	if plaintext == "" {
		return nil
	}
	serverEncrypted, err := ServerEncrypt(plaintext)
	if err != nil {
		log.Err(err).Msg("Cannot encrypt secret")
		return nil
	}
	return &proto.Secret{
		ServerEncrypted: serverEncrypted,
	}
}

// EncryptedToClient decrypts secret from server and sends placeholder to client
func EncryptedToClient(combined string) *proto.Secret {
	if combined == "" {
		return nil
	}
	plaintext, err := ServerDecrypt(combined)
	if err != nil {
		log.Err(err).Msg("Cannot decrypt secret")
		return nil
	}
	return &proto.Secret{
		Length: int32(len(plaintext)),
	}
}

func SecretToServerEncrypted(secret *proto.Secret, claims *user.Claims) string {
	plaintext := SecretToString(secret, claims)
	if plaintext == "" {
		return ""
	}
	serverEncrypted, err := ServerEncrypt(plaintext)
	if err != nil {
		log.Err(err).Msg("Cannot encrypt secret")
		return ""
	}
	return serverEncrypted
}

func SecretToString(secret *proto.Secret, claims *user.Claims) string {
	if secret == nil {
		return ""
	}
	if secret.ServerEncrypted != "" {
		plaintext, err := ServerDecrypt(secret.ServerEncrypted)
		if err != nil {
			log.Err(err).Msg("Cannot decrypt secret")
			return ""
		}
		return plaintext
	}
	if secret.ClientEncrypted != "" {
		if claims == nil {
			log.Err(fmt.Errorf("claims is nil")).Msg("Cannot decrypt secret")
			return ""
		}
		plaintext, err := DecryptFromClient(*claims, secret.ClientEncrypted)
		if err != nil {
			log.Err(err).Msg("Cannot decrypt secret")
			return ""
		}
		return plaintext
	}
	log.Error().Msg("Secret is empty")
	return ""
}

func ServerDecrypt(combined string) (string, error) {
	// Split the combined string into its ciphertext and nonce components
	parts := strings.Split(combined, ".")
	if len(parts) != 2 {
		return "", fmt.Errorf("combined string format is incorrect")
	}

	// Decode the base64 encoded ciphertext
	ciphertext, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}

	// Decode the base64 encoded nonce
	nonce, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}

	// Generate a new AES cipher using the key
	block, err := aes.NewCipher(dataEncryptionKey)
	if err != nil {
		return "", err
	}

	// Create a new GCM cipher mode instance
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Decrypt the ciphertext
	plaintextBytes, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	// Convert the plaintext bytes back to a string
	plaintext := string(plaintextBytes)

	return plaintext, nil
}

// fetchGoogleSecret fetches secret from Google Secret Manager using application default credentials
func fetchGoogleSecret(secretName string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := secretsmanager.NewClient(ctx)
	if err != nil {
		return "", err
	}
	defer client.Close()
	secret, err := client.AccessSecretVersion(ctx, &secretmanagerpb.AccessSecretVersionRequest{
		Name: secretName,
	})
	if err != nil {
		return "", err
	}
	return string(secret.Payload.Data), nil
}

var keys [][]byte // Store AES keys
var ivs [][]byte  // Store IVs for each key

// GenerateKeys generates 10 AES-256 keys and IVs.
func generateClientKeys() error {
	for i := 0; i < 10; i++ {
		key := make([]byte, 32) // AES-256, so 32 bytes key
		iv := make([]byte, 12)  // AES block size

		if _, err := io.ReadFull(rand.Reader, key); err != nil {
			return err
		}
		if _, err := io.ReadFull(rand.Reader, iv); err != nil {
			return err
		}

		keys = append(keys, key)
		ivs = append(ivs, iv)
	}
	return nil
}

// getKeyIndex returns an index for the keys slice based on the accessToken.
func getKeyIndex(accessToken string) int {
	hash := sha256.Sum256([]byte(accessToken))
	// Use the first byte to get an index, ensuring it's within the range of 0-9
	return int(hash[0]) % 10
}

func GetClientIVBase64(claims user.Claims) string {
	return base64.StdEncoding.EncodeToString(ivs[getKeyIndex(claims.AccessToken)])
}

func GetClientKeyBase64(claims user.Claims) string {
	return base64.StdEncoding.EncodeToString(keys[getKeyIndex(claims.AccessToken)])
}

func getClientKeys(claims user.Claims) ([]byte, []byte) {
	accessToken := claims.AccessToken
	keyIndex := getKeyIndex(accessToken)
	return keys[keyIndex], ivs[keyIndex]
}

func DecryptFromClient(claims user.Claims, encrypted string) (string, error) {
	key, iv := getClientKeys(claims)
	return decryptFromClient(key, iv, encrypted)
}

func decryptFromClient(key, iv []byte, encryptedBase64 string) (string, error) {
	encrypted, err := base64.StdEncoding.DecodeString(encryptedBase64)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	plaintext, err := gcm.Open(nil, iv, encrypted, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
