package snowflakeconn

import (
	"os"

	"github.com/rs/zerolog/log"
	sf "github.com/snowflakedb/gosnowflake"
)

// func getDataSourceName() string {
// 	token := readSnowparkToken()
// 	if token != "" {
// 		log.Debug().Msg("Using snowpark token")
// 		return fmt.Sprintf(
// 			"dekart:zzz@%s/%s/%s?account=%s&token=%s&warehouse=%s&authenticator=oauth&insecureMode=true&tracing=debug",
// 			os.Getenv("SNOWFLAKE_HOST"),
// 			os.Getenv("SNOWFLAKE_DATABASE"),
// 			os.Getenv("SNOWFLAKE_SCHEMA"),
// 			os.Getenv("SNOWFLAKE_ACCOUNT"),
// 			token,
// 			os.Getenv("SNOWFLAKE_WAREHOUSE"),
// 		)
// 		// log.Debug().Str("dataSourceName", dataSourceName).Msg("Using snowpark token")
// 	}
// 	devConnectionString := os.Getenv("DEKART_SNOWFLAKE_DEV_CONNECTION_STRING")
// 	if devConnectionString != "" {
// 		log.Warn().Str("devConnectionString", devConnectionString).Msg("Using snowflake dev connection string")
// 		return devConnectionString
// 	}
// 	log.Debug().Msg("Using snowflake password")
// 	return fmt.Sprintf(
// 		"%s:%s@%s",
// 		os.Getenv("DEKART_SNOWFLAKE_USER"),
// 		os.Getenv("DEKART_SNOWFLAKE_PASSWORD"),
// 		os.Getenv("DEKART_SNOWFLAKE_ACCOUNT_ID"),
// 	)
// }

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

func getConfig() sf.Config {
	token := readSnowparkToken()
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
	if token != "" {
		log.Debug().Msg("Using snowpark token")
		return sf.Config{
			Account:       os.Getenv("SNOWFLAKE_ACCOUNT"),
			Host:          os.Getenv("SNOWFLAKE_HOST"),
			Database:      os.Getenv("SNOWFLAKE_DATABASE"),
			Schema:        os.Getenv("SNOWFLAKE_SCHEMA"),
			Authenticator: sf.AuthTypeOAuth,
			Token:         token,
			Params:        map[string]*string{},
		}
	}
	log.Fatal().Msg("No snowflake credentials found")
	return sf.Config{}
}

func GetConnector() sf.Connector {
	config := getConfig()
	driver := sf.SnowflakeDriver{}
	return sf.NewConnector(driver, config)
}
