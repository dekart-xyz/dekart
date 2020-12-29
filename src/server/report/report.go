package report

import (
	"sync"

	"github.com/rs/zerolog/log"
)

// Streams of report changes; use NewStreams to init
type Streams struct {
	channels map[string]map[string]chan int
	mutex    sync.RWMutex
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
	s.channels = make(map[string]map[string]chan int)
}

// All means subscribing for all reports changes
const All string = "AllReports"

// Register to listen report updates
func (s *Streams) Register(reportID string, streamID string) chan int {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	streamMap, ok := s.channels[reportID]
	if !ok {
		streamMap = make(map[string]chan int)
		s.channels[reportID] = streamMap
	}
	_, ok = streamMap[streamID]
	if ok {
		log.Fatal().Msgf("streamID %s exists", streamID)
	}
	ch := make(chan int)
	streamMap[streamID] = ch
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

// Ping about report update
func (s *Streams) Ping(reportID string) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	for _, rid := range []string{reportID, All} {
		streamMap, ok := s.channels[rid]
		if !ok {
			return
		}
		for _, ch := range streamMap {
			ch <- 1
		}
	}
}
