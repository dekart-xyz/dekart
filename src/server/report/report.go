package report

import (
	"sync"

	"github.com/rs/zerolog/log"
)

type Streams struct {
	channels map[string]map[string]chan int
	mutex    sync.RWMutex
}

func NewStreams() *Streams {
	s := &Streams{}
	s.Init()
	return s
}

func (s *Streams) Init() {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.channels = make(map[string]map[string]chan int)
}

func (s *Streams) Regter(reportId string, streamId string) chan int {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	streamMap, ok := s.channels[reportId]
	if !ok {
		streamMap = make(map[string]chan int)
		s.channels[reportId] = streamMap
	}
	_, ok = streamMap[streamId]
	if ok {
		log.Fatal().Msgf("streamId %s exists", streamId)
	}
	ch := make(chan int)
	streamMap[streamId] = ch
	return ch
}

func (s *Streams) Unregister(reportId string, streamId string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	streamMap, ok := s.channels[reportId]
	if !ok {
		log.Fatal().Msgf("reportId %s does not exist", reportId)
	}
	delete(streamMap, streamId)
}

func (s *Streams) Ping(reportId string) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	streamMap, ok := s.channels[reportId]
	if !ok {
		return
	}
	for _, ch := range streamMap {
		ch <- 1
	}
}
