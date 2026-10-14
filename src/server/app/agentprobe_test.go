package app

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// TestAgentKeepaliveChromeProbe verifies the real browser receives idle SSE traffic on arrival.
func TestAgentKeepaliveChromeProbe(t *testing.T) {
	addr := os.Getenv("DEKART_AGENT_PROBE_ADDR")
	if addr == "" {
		t.Skip("set DEKART_AGENT_PROBE_ADDR and open it in Chrome to run P1")
	}
	results := make(chan string, 1)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		io.WriteString(w, `<!doctype html><title>Agent keepalive probe</title><pre id="output">Starting Chrome fetch</pre><script>
(async () => {
const output = document.getElementById('output'); const start = performance.now(); const times = [];
try {
 const response = await fetch('/stream'); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
 while (true) { const {value, done} = await reader.read(); if (done) break; buffer += decoder.decode(value, {stream:true});
 let index; while ((index = buffer.indexOf('\n\n')) >= 0) { buffer = buffer.slice(index + 2); times.push((performance.now()-start)/1000); output.textContent = JSON.stringify(times); }
 }
 const pass = times.length === 6 && times.every((time, index) => Math.abs(time - (index+1)*15) < 5) && performance.now()-start >= 100000;
 output.textContent = (pass ? 'PASS ' : 'FAIL ') + JSON.stringify(times) + ' duration=' + (performance.now()-start)/1000;
} catch(error) { output.textContent = 'FAIL ' + error; }
await fetch('/result', {method:'POST', body:output.textContent});
})();</script>`)
	})
	mux.HandleFunc("/stream", func(w http.ResponseWriter, r *http.Request) {
		stream, err := newIdleTimeoutResponseWriter(w, 65*time.Second)
		if err != nil {
			t.Error(err)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		start := time.Now()
		for index := 1; index <= 6; index++ {
			timer := time.NewTimer(time.Until(start.Add(time.Duration(index) * 15 * time.Second)))
			select {
			case <-r.Context().Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			if _, err := fmt.Fprint(stream, ": keepalive\n\n"); err != nil {
				t.Error(err)
				return
			}
			if err := http.NewResponseController(w).Flush(); err != nil {
				t.Error(err)
				return
			}
		}
		select {
		case <-r.Context().Done():
		case <-time.After(time.Until(start.Add(100 * time.Second))):
		}
	})
	mux.HandleFunc("/result", func(w http.ResponseWriter, r *http.Request) { body, _ := io.ReadAll(r.Body); results <- string(body) })
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: mux, WriteTimeout: 65 * time.Second}
	defer server.Close()
	go server.Serve(listener)
	t.Logf("Open http://%s in Chrome", listener.Addr())
	select {
	case result := <-results:
		t.Log(result)
		if !strings.HasPrefix(result, "PASS ") {
			t.Fatal(result)
		}
	case <-time.After(150 * time.Second):
		t.Fatal("Chrome did not finish the 100-second probe")
	}
}
