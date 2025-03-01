package snowflakeutils

import (
	"database/sql"
	"dekart/src/proto"
	"dekart/src/server/secrets"
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

func getConfig(conn *proto.Connection) sf.Config {
	if conn != nil && !conn.IsDefault { // for default connection we use environment variables
		password := secrets.SecretToString(conn.SnowflakePassword, nil)
		return sf.Config{
			Account:   conn.SnowflakeAccountId,
			User:      conn.SnowflakeUsername,
			Warehouse: conn.SnowflakeWarehouse,
			Password:  password,
			Params:    map[string]*string{},
		}

	}
	dekartSnowflakeUser := os.Getenv("DEKART_SNOWFLAKE_USER")
	if dekartSnowflakeUser != "" {
		log.Debug().Msg("Using snowflake password")
		return sf.Config{
			Account:  os.Getenv("DEKART_SNOWFLAKE_ACCOUNT_ID"),
			User:     dekartSnowflakeUser,
			Password: os.Getenv("DEKART_SNOWFLAKE_PASSWORD"),
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
