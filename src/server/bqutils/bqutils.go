package bqutils

import (
	"context"
	"dekart/src/proto"
	"dekart/src/server/secrets"
	"dekart/src/server/user"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/rs/zerolog/log"

	bqStorage "cloud.google.com/go/bigquery/storage/apiv1"
	"cloud.google.com/go/storage"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/option"
)

func getOauthScopes() []string {
	scopes := []string{"https://www.googleapis.com/auth/bigquery"}
	extraScopesRaw := os.Getenv("DEKART_GCP_EXTRA_OAUTH_SCOPES")
	if extraScopesRaw != "" {
		extraScopes := strings.Split(extraScopesRaw, ",")
		scopes = append(scopes, extraScopes...)
	}
	return scopes

}

func GetTableFromJob(job *bigquery.Job) (*bigquery.Table, error) {
	cfg, err := job.Config()
	if err != nil {
		return nil, err
	}
	queryConfig, ok := cfg.(*bigquery.QueryConfig)
	if !ok {
		return nil, fmt.Errorf("was expecting QueryConfig type for configuration")
	}
	return queryConfig.Dst, nil
}

func GetClient(ctx context.Context, conn *proto.Connection) (*bigquery.Client, error) {
	if conn == nil {
		return nil, fmt.Errorf("connection is nil")
	}
	tokenSource := user.GetTokenSource(ctx)
	var secretOption option.ClientOption
	claims := user.GetClaims(ctx)
	projectID := conn.BigqueryProjectId
	if conn.BigqueryKey != nil {
		bigqueryKeyStr := secrets.SecretToString(conn.BigqueryKey, claims)

		//parse json from bigqueryKeyStr and extract project_id
		var keyData map[string]interface{}
		if err := json.Unmarshal([]byte(bigqueryKeyStr), &keyData); err != nil {
			return nil, fmt.Errorf("failed to parse bigquery key: %v", err)
		}
		var ok bool
		projectID, ok = keyData["project_id"].(string)
		if !ok {
			return nil, fmt.Errorf("project_id not found in bigquery key")
		}
		secretOption = option.WithCredentialsJSON([]byte(bigqueryKeyStr))
	} else if tokenSource != nil {
		secretOption = option.WithTokenSource(tokenSource)
	} else {
		secretOption = option.WithScopes(getOauthScopes()...)
	}
	return bigquery.NewClient(
		ctx,
		projectID,
		secretOption,
	)
}

func GetReadClient(ctx context.Context, conn *proto.Connection) (*bqStorage.BigQueryReadClient, error) {
	if conn == nil {
		return nil, fmt.Errorf("connection is nil")
	}
	tokenSource := user.GetTokenSource(ctx)
	var secretOption option.ClientOption
	claims := user.GetClaims(ctx)
	if conn.BigqueryKey != nil {
		bigqueryKeyStr := secrets.SecretToString(conn.BigqueryKey, claims)

		//parse json from bigqueryKeyStr and extract project_id
		var keyData map[string]interface{}
		if err := json.Unmarshal([]byte(bigqueryKeyStr), &keyData); err != nil {
			return nil, fmt.Errorf("failed to parse bigquery key: %v", err)
		}
		secretOption = option.WithCredentialsJSON([]byte(bigqueryKeyStr))
	} else if tokenSource != nil {
		log.Debug().Msg("GetReadClient: Using token source")
		secretOption = option.WithTokenSource(tokenSource)
	}
	if secretOption == nil {
		return bqStorage.NewBigQueryReadClient(ctx)
	}
	return bqStorage.NewBigQueryReadClient(
		ctx,
		secretOption,
	)
}

func GetStorageClient(ctx context.Context, conn *proto.Connection, ignoreUserToken bool) (*storage.Client, error) {
	if conn == nil {
		return nil, fmt.Errorf("connection is nil")
	}
	tokenSource := user.GetTokenSource(ctx)
	var secretOption option.ClientOption
	claims := user.GetClaims(ctx)
	if conn.BigqueryKey != nil && !ignoreUserToken {
		bigqueryKeyStr := secrets.SecretToString(conn.BigqueryKey, claims)

		//parse json from bigqueryKeyStr and extract project_id
		var keyData map[string]interface{}
		if err := json.Unmarshal([]byte(bigqueryKeyStr), &keyData); err != nil {
			return nil, fmt.Errorf("failed to parse bigquery key: %v", err)
		}
		secretOption = option.WithCredentialsJSON([]byte(bigqueryKeyStr))
	} else if tokenSource != nil && !ignoreUserToken {
		secretOption = option.WithTokenSource(tokenSource)
	}
	if secretOption == nil {
		return storage.NewClient(ctx)
	}
	return storage.NewClient(
		ctx,
		secretOption,
	)
}
