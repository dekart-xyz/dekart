package report

import (
	"sync"

	"github.com/rs/zerolog/log"
)

// Streams of report changes; use NewStreams to init
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

// All means subscribing for all reports changes
const All string = "AllReports"

// Register to listen report updates
func (s *Streams) Register(reportID string, streamID string, sequence int64) chan int64 {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	currentSequence, ok := s.sequence[reportID]
	if !ok {
		//initial sequence sent by client is sequence=0
		// first time we always send update
		s.sequence[reportID] = 1
		currentSequence = 1
	}
	streamMap, ok := s.channels[reportID]
	if !ok {
		streamMap = make(map[string]chan int64)
		s.channels[reportID] = streamMap
	}
	_, ok = streamMap[streamID]
	if ok {
		log.Fatal().Msgf("streamID %s exists", streamID)
	}
	ch := make(chan int64)
	streamMap[streamID] = ch
	if currentSequence > sequence {
		log.Debug().Str("reportID", reportID).Str("streamID", streamID).Int64("sequence", sequence).Int64("currentSequence", currentSequence).Msgf("Update outdated subscription")
		go func() {
			ch <- currentSequence
		}()
	}
	return ch
}

// Deregister from report updates
func (s *Streams) Deregister(reportID string, streamID string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	streamMap, ok := s.channels[reportID]
	if !ok {
		log.Fatal().Msgf("reportId %s does not exist", reportID)
	}
	delete(streamMap, streamID)
}

func (s *Streams) PingAll(reportIDs []string) {
	for _, reportID := range reportIDs {
		s.Ping(reportID)
	}
}

// Ping about report update
func (s *Streams) Ping(reportID string) {
	log.Debug().Str("reportID", reportID).Msgf("Ping")
	s.mutex.Lock()
	defer s.mutex.Unlock()
	for _, rid := range []string{reportID, All} {
		sequence, ok := s.sequence[rid]
		if !ok {
			//initial sequence in register is sequence=1
			sequence = 1
		}
		s.sequence[rid] = sequence + 1
		streamMap, ok := s.channels[rid]
		if !ok {
			continue
		}
		for _, ch := range streamMap {
			log.Debug().Int64("sequence", s.sequence[rid]).Str("rid", rid).Msgf("Update subscriber")
			go func(ch chan int64, rid string) {
				ch <- s.sequence[rid]
			}(ch, rid)
		}
	}
}
