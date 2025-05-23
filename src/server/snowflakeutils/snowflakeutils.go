package snowflakeutils

import (
	"crypto/rsa"
	"crypto/x509"
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/secrets"
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
	sf "github.com/snowflakedb/gosnowflake"
)

// https://docs.snowflake.com/en/developer-guide/snowpark-container-services/additional-considerations-services-jobs#connecting-to-snowflake
func readSnowparkToken() string {
	_, err := os.Stat("/snowflake/session/token")
	if os.IsNotExist(err) {
		return ""
	}
	token, err := os.ReadFile("/snowflake/session/token")
	if err != nil {
		log.Error().Err(err).Msg("failed to read token")
		return ""
	}
	return string(token)
}

func ParsePrivateKey(base64Key string) (*rsa.PrivateKey, error) {
	// Decode the base64-encoded private key
	decodedKey, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64 private key: %w", err)
	}

	// Parse the private key
	privateKey, err := x509.ParsePKCS8PrivateKey(decodedKey)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PKCS8 private key: %w", err)
	}

	// Assert the type to *rsa.PrivateKey
	rsaKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("not an RSA private key")
	}

	return rsaKey, nil
}

func getConfig(conn *proto.Connection) sf.Config {
	if conn != nil && !conn.IsDefault { // for default connection we use environment variables
		password := secrets.SecretToString(conn.SnowflakePassword, nil)
		privateKey := secrets.SecretToString(conn.SnowflakeKey, nil)
		if password != "" && privateKey == "" {
			// legacy support for password
			return sf.Config{
				Account:   conn.SnowflakeAccountId,
				User:      conn.SnowflakeUsername,
				Warehouse: conn.SnowflakeWarehouse,
				Password:  password,
				Params:    map[string]*string{},
			}
		}

		pk, err := ParsePrivateKey(privateKey)
		if err != nil {
			return sf.Config{}
		}
		return sf.Config{
			Account:       conn.SnowflakeAccountId,
			User:          conn.SnowflakeUsername,
			Authenticator: sf.AuthTypeJwt,
			PrivateKey:    pk,
			Params:        map[string]*string{},
		}
	}
	privateKey := os.Getenv("DEKART_SNOWFLAKE_PRIVATE_KEY")
	dekartSnowflakeUser := os.Getenv("DEKART_SNOWFLAKE_USER")
	dekartSnowflakePassword := os.Getenv("DEKART_SNOWFLAKE_PASSWORD")
	dekartSnowflakeAccount := os.Getenv("DEKART_SNOWFLAKE_ACCOUNT_ID")

	if privateKey != "" {
		log.Debug().Msg("Using snowflake private key")
		pk, err := ParsePrivateKey(privateKey)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to parse private key")
			return sf.Config{}
		}
		return sf.Config{
			Account:       dekartSnowflakeAccount,
			User:          dekartSnowflakeUser,
			Authenticator: sf.AuthTypeJwt,
			PrivateKey:    pk,
			Params:        map[string]*string{},
		}
	}
	if dekartSnowflakePassword != "" {
		log.Warn().Msg("Using snowflake password is deprecated, use private key instead")
		return sf.Config{
			Account:  dekartSnowflakeAccount,
			User:     dekartSnowflakeUser,
			Password: dekartSnowflakePassword,
			Params:   map[string]*string{},
		}
	}
	token := readSnowparkToken()
	if token != "" {
		log.Debug().Msg("Using snowpark token")
		// https://docs.snowflake.com/en/developer-guide/snowpark-container-services/tutorials/tutorial-2#main-py-file
		// https://docs.snowflake.com/en/developer-guide/snowpark-container-services/additional-considerations-services-jobs
		return sf.Config{
			Account:       os.Getenv("SNOWFLAKE_ACCOUNT"),
			Host:          os.Getenv("SNOWFLAKE_HOST"),
			Database:      os.Getenv("SNOWFLAKE_DATABASE"),
			Schema:        os.Getenv("SNOWFLAKE_SCHEMA"),
			Authenticator: sf.AuthTypeOAuth,
			Token:         token,
			Params:        map[string]*string{},
			InsecureMode:  true,
		}
	}
	log.Fatal().Msg("No snowflake credentials found")
	return sf.Config{}
}

// GetConnector returns a snowflake connector
func GetConnector(conn *proto.Connection) sf.Connector {
	config := getConfig(conn)
	driver := sf.SnowflakeDriver{}
	return sf.NewConnector(driver, config)
}

func GetColumns(rows *sql.Rows) ([]string, error) {
	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		log.Error().Err(err).Msg("Error getting column types")
		return nil, err
	}
	columnNames := make([]string, len(columnTypes))
	for i, columnType := range columnTypes {
		columnNames[i] = columnType.Name()
	}
	return columnNames, nil
}

func GetRow(rows *sql.Rows) ([]string, error) {
	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		log.Error().Err(err).Msg("Error getting column types")
		return nil, err
	}
	csvRow := make([]string, len(columnTypes))
	values := make([]interface{}, len(columnTypes))
	for i := range columnTypes {
		values[i] = new(sql.NullString)
	}
	rows.Scan(values...)

	for i := range columnTypes {
		value := values[i]
		switch x := value.(type) {
		case *sql.NullString:
			csvRow[i] = x.String
		default:
			return nil, fmt.Errorf("incorrect type of data: %T", x)
		}
	}
	return csvRow, nil
}

// ParseRows reads rows from a sql.Rows object and writes them to a csv.Writer or a channel of csv rows
func ParseRows(rows *sql.Rows, csvWriter *csv.Writer, csvRows chan []string) (bool, error) {
	firstRow := true
	for rows.Next() {
		columnTypes, err := rows.ColumnTypes()
		if err != nil {
			log.Error().Err(err).Msg("Error getting column types")
			return firstRow, err
		}
		if firstRow {
			firstRow = false
			columnNames := make([]string, len(columnTypes))
			for i, columnType := range columnTypes {
				columnNames[i] = columnType.Name()
			}
			if csvWriter != nil {
				err := csvWriter.Write(columnNames)
				if err != nil {
					log.Error().Err(err).Msg("Error writing column names")
					return firstRow, err
				}
			} else {
				csvRows <- columnNames
			}

		}

		csvRow := make([]string, len(columnTypes))
		values := make([]interface{}, len(columnTypes))
		for i := range columnTypes {
			values[i] = new(sql.NullString)
		}
		rows.Scan(values...)

		for i := range columnTypes {
			value := values[i]
			switch x := value.(type) {
			case *sql.NullString:
				csvRow[i] = x.String
			default:
				return firstRow, fmt.Errorf("incorrect type of data: %T", x)
			}
		}
		if csvWriter != nil {
			err = csvWriter.Write(csvRow)
			if err != nil {
				log.Error().Err(err).Msg("Error writing column names")
				return firstRow, err
			}
		} else {
			csvRows <- csvRow
		}
	}
	return firstRow, nil
}
