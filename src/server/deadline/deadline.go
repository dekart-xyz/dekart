package deadline

import (
	"os"
	"time"

	"github.com/rs/zerolog/log"
)

func GetQueryCacheDeadline() time.Duration {
	//parse deadline form environment
	deadlineStr := os.Getenv("DEKART_DEV_QUERY_CACHE_DEADLINE")
	deadline := 23 * time.Hour // default deadline
	if deadlineStr != "" {
		parsedDeadline, err := time.ParseDuration(deadlineStr)
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to parse DEKART_DEV_QUERY_CACHE_DEADLINE")
		}
		deadline = parsedDeadline
	}
	return deadline
}

// GetMinJobAgeForErrorPropagation returns the minimum age threshold for propagating real errors
// For jobs updated more recently than this, we propagate actual errors (e.g., permission issues)
// rather than treating them as expired
func GetMinJobAgeForErrorPropagation() time.Duration {
	return 8 * time.Minute
}
