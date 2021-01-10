package uuid

import (
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

func GetUUID() string {
	u, err := uuid.NewRandom()
	if err != nil {
		log.Fatal().Err(err).Send()
		return ""
	}
	return u.String()
}
