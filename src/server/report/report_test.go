package report

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func waitTimeout(wg *sync.WaitGroup, timeout time.Duration) bool {
	c := make(chan struct{})
	go func() {
		defer close(c)
		wg.Wait()
	}()
	select {
	case <-c:
		return true // completed normally
	case <-time.After(timeout):
		return false // timed out
	}
}

func TestReportStreamsBasicFlow(t *testing.T) {
	streams := NewStreams()
	reportID := "report1"
	sequence := int64(0)
	var wg sync.WaitGroup

	numStreams := 2
	numPings := 10
	wg.Add(numStreams*numPings + numStreams)
	for i := 0; i < numStreams; i++ {
		t.Logf("Starting goroutine %d", i)
		ch := streams.Register(reportID, fmt.Sprintf("stream%d", i), sequence)
		go func(ch chan int64) {
			//read from channel until it is closed
			for s := range ch {
				t.Logf("received from channel: %d", s)
				wg.Done()
			}

		}(ch)
	}

	// Perform concurrent Ping operations
	for j := 0; j < numPings; j++ {
		go func() {
			streams.Ping(reportID)
		}()
	}
	if !waitTimeout(&wg, 3*time.Second) {
		assert.Fail(t, "WaitGroup timed out")
	}

}
