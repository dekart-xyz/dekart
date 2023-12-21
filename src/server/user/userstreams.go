package user

import (
	"sync"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// Streams of changes; use NewStreams to init
type Streams struct {
	channels map[string]map[string]chan int64
	sequence map[string]int64
	mutex    sync.Mutex
}

// NewStreams creates new Streams struct
func NewStreams() *Streams {
	s := &Streams{}
	s.Init()
	return s
}

// Init Streams; do not call directly, use NewStreams
func (s *Streams) Init() {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.channels = make(map[string]map[string]chan int64)
	s.sequence = make(map[string]int64)
}

// Register to listen report updates
func (s *Streams) Register(claims Claims, sequence int64) (chan int64, string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	streamUuid, err := uuid.NewRandom()
	streamID := streamUuid.String()
	if err != nil {
		log.Fatal().Err(err).Msg("Cannot generate streamID")
	}
	user := claims.Email
	currentSequence, ok := s.sequence[claims.Email]
	if !ok {
		//initial sequence sent by client is sequence=0
		// first time we always send update
		s.sequence[user] = 1
		currentSequence = 1
	}
	streamMap, ok := s.channels[user]
	if !ok {
		streamMap = make(map[string]chan int64)
		s.channels[user] = streamMap
	}
	_, ok = streamMap[streamID]
	if ok {
		log.Fatal().Msgf("streamID %s exists", streamID)
	}
	ch := make(chan int64)
	streamMap[streamID] = ch
	if currentSequence > sequence {
		log.Debug().Str("user", user).Str("streamID", streamID).Int64("sequence", sequence).Int64("currentSequence", currentSequence).Msgf("Update outdated subscription")
		go func() {
			ch <- currentSequence
		}()
	}
	return ch, streamID
}

// Deregister from updates
func (s *Streams) Deregister(claims Claims, streamID string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	streamMap, ok := s.channels[claims.Email]
	if !ok {
		log.Fatal().Msgf("user %s does not exist", claims.Email)
	}
	delete(streamMap, streamID)
}

// Ping about report update
func (s *Streams) Ping(users []string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	for _, user := range users {
		sequence, ok := s.sequence[user]
		if !ok {
			//initial sequence in register is sequence=1
			sequence = 1
		}
		s.sequence[user] = sequence + 1
		streamMap, ok := s.channels[user]
		if !ok {
			continue
		}
		for _, ch := range streamMap {
			go func(ch chan int64, sequence int64) {
				ch <- sequence
			}(ch, s.sequence[user])
		}
	}
}

// Ping all connected users
func (s *Streams) PingAll() {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	for user := range s.channels {
		sequence, ok := s.sequence[user]
		if !ok {
			//initial sequence in register is sequence=1
			sequence = 1
		}
		s.sequence[user] = sequence + 1
		streamMap, ok := s.channels[user]
		if !ok {
			continue
		}
		for _, ch := range streamMap {
			go func(ch chan int64, sequence int64, user string) {
				log.Debug().Str("user", user).Int64("sequence", sequence).Msg("PingAll sending sequence")
				ch <- sequence
			}(ch, s.sequence[user], user)
		}
	}
}
