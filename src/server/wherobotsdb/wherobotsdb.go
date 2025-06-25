package wherobotsdb

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/fxamacker/cbor/v2"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

const (
	DEFAULT_ENDPOINT             = "api.cloud.wherobots.com"
	PROTOCOL_VERSION             = "1.0.0"
	MAX_WEBSOCKET_MESSAGE_BYTES  = 100 << 20 // 100 MiB
	DEFAULT_SESSION_WAIT_SECONDS = 660
	DEFAULT_WS_READ_SECONDS      = 660
)

// Only the enums we really touch:
type ExecutionState string

const (
	execSucceeded ExecutionState = "succeeded"
	execFailed    ExecutionState = "failed"
	execCancelled ExecutionState = "cancelled"
)

type RequestKind string

const (
	reqExecuteSQL RequestKind = "execute_sql"
	reqCancel     RequestKind = "cancel"
)

type EventKind string

const (
	evtStateUpdated    EventKind = "state_updated"
	evtExecutionResult EventKind = "execution_result"
	evtError           EventKind = "error"
)

type inboundMessage struct {
	Kind        string `json:"kind"        cbor:"kind"`
	ExecutionID string `json:"execution_id" cbor:"execution_id"`
	State       string `json:"state"       cbor:"state"`

	// Populated on success
	ResultURI string `json:"result_uri" cbor:"result_uri"`
	Size      int64  `json:"size"       cbor:"size"`

	// Populated on error
	Message string `json:"message"     cbor:"message"`
}

// We only surface URI + Size (rows & columns left empty for now)
type TypedResult struct {
	URI  string
	Size int64
}

type Query struct {
	ID         string
	State      ExecutionState
	ResultChan chan interface{} // TypedResult or error
}

type Cursor struct {
	conn *Connection

	execFn   func(string) (string, error)
	cancelFn func(string)

	execID   string
	result   *TypedResult
	fetchErr error
	once     sync.Once
}

func newCursor(conn *Connection) *Cursor {

	c := &Cursor{
		conn:     conn,
		execFn:   conn.executeSQL,
		cancelFn: conn.cancelQuery,
	}
	go func() {
		<-conn.ctx.Done()
		c.Close()
	}()
	return c
}

func (c *Cursor) Execute(sql string) error {
	if c.execID != "" && c.result == nil {
		c.cancelFn(c.execID) // kill previous run if unfinished
	}
	var err error
	c.execID, err = c.execFn(sql)
	return err
}

func (c *Cursor) closeIfNeeded() {
	if c.execID != "" && c.result == nil {
		c.cancelFn(c.execID)
	}
}

// ensure waits once for the final result or error
func (c *Cursor) ensure() error {
	c.once.Do(func() {
		q := c.conn.getQuery(c.execID)
		if q == nil {
			c.fetchErr = errors.New("query tracking lost")
			return
		}
		res := <-q.ResultChan
		switch v := res.(type) {
		case error:
			c.fetchErr = v
		case TypedResult:
			c.result = &v
		default:
			c.fetchErr = errors.New("unknown message on ResultChan")
		}
		c.conn.removeQuery(c.execID)
	})
	return c.fetchErr
}

// GetResultURI blocks until the query finishes and returns the presigned URL.
func (c *Cursor) GetResultURI() (string, error) {
	if err := c.ensure(); err != nil {
		return "", err
	}
	return c.result.URI, nil
}

// GetResultSize blocks until finish and returns size in bytes.
func (c *Cursor) GetResultSize() (int64, error) {
	if err := c.ensure(); err != nil {
		return 0, err
	}
	return c.result.Size, nil
}

func (c *Cursor) Close() error {
	c.closeIfNeeded()
	return c.conn.Close() // this will also close the WebSocket connection
}

type Connection struct {
	ws          *websocket.Conn
	readTimeout time.Duration

	queriesMu sync.Mutex
	queries   map[string]*Query

	closed bool
	done   chan struct{}
	wg     sync.WaitGroup
	ctx    context.Context
}

func (c *Connection) Cursor() *Cursor { return newCursor(c) }
func (c *Connection) Close() error {
	c.queriesMu.Lock()
	if c.closed {
		c.queriesMu.Unlock()
		return nil
	}
	c.closed = true
	c.queriesMu.Unlock()

	close(c.done)
	_ = c.ws.Close()
	c.wg.Wait()
	return nil
}

func (c *Connection) getQuery(id string) *Query {
	c.queriesMu.Lock()
	defer c.queriesMu.Unlock()
	return c.queries[id]
}
func (c *Connection) addQuery(q *Query) {
	c.queriesMu.Lock()
	c.queries[q.ID] = q
	c.queriesMu.Unlock()
}
func (c *Connection) removeQuery(id string) {
	c.queriesMu.Lock()
	delete(c.queries, id)
	c.queriesMu.Unlock()
}

func (c *Connection) backgroundLoop() {
	defer c.wg.Done()

	for {
		select {
		case <-c.done:
			return
		default:
		}

		mt, payload, err := c.ws.ReadMessage()
		if err != nil {
			// If the error is due to closed network connection, just return.
			if strings.Contains(err.Error(), "use of closed network connection") {
				return
			}
			log.Error().Err(err).Msg("websocket read error")
			return
		}

		var msg inboundMessage
		switch mt {
		case websocket.TextMessage:
			if err := json.Unmarshal(payload, &msg); err != nil {
				continue
			}
		case websocket.BinaryMessage:
			if err := cbor.Unmarshal(payload, &msg); err != nil {
				continue
			}
		default:
			continue
		}

		c.dispatch(msg)
	}
}

func (c *Connection) dispatch(m inboundMessage) {
	q := c.getQuery(m.ExecutionID)
	if q == nil {
		return // unknown query – ignore
	}
	switch EventKind(strings.ToLower(m.Kind)) {

	case evtStateUpdated, evtExecutionResult:
		state := ExecutionState(strings.ToLower(m.State))
		q.State = state

		if state == execSucceeded {
			q.ResultChan <- TypedResult{URI: m.ResultURI, Size: m.Size}
		} else if state == execFailed {
			// we ignore this, as after failed we need to wait for evtError
		} else if state == execCancelled {
			q.ResultChan <- fmt.Errorf("wherobots query cancelled")
		}

	case evtError:
		errMsg := m.Message
		if errMsg == "" {
			errMsg = "unknown wherobots error"
		}
		q.ResultChan <- fmt.Errorf("%s", errMsg)
	}
}

func (c *Connection) wsSend(v any) error {
	msg, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.ws.WriteMessage(websocket.TextMessage, msg)
}

func (c *Connection) executeSQL(sql string) (string, error) {
	id := uuid() // naive
	q := &Query{ID: id, ResultChan: make(chan interface{}, 1)}
	c.addQuery(q)

	req := map[string]any{
		"kind":         string(reqExecuteSQL),
		"execution_id": id,
		"statement":    sql,
		"store": map[string]string{
			"single":                 "true",
			"generate_presigned_url": "true",
		},
	}
	if err := c.wsSend(req); err != nil {
		return "", err
	}
	return id, nil
}

func (c *Connection) cancelQuery(id string) {
	_ = c.wsSend(map[string]any{
		"kind":         string(reqCancel),
		"execution_id": id,
	})
}

type Runtime string
type Region string

const (
	RuntimeTINY   Runtime = "tiny"
	RegionDefault Region  = "aws-us-west-2"
	userAgent             = "wherobots-go-dbapi/1.0"
)

func Connect(
	ctx context.Context,
	endpoint string,
	token string,
	apiKey string,
	runtime Runtime,
	region Region,
	sessionWaitSec int, // 0 = default
	readTimeoutSec int, // 0 = default
) (*Connection, error) {

	if token == "" && apiKey == "" {
		return nil, errors.New("token or apiKey required")
	}
	if token != "" && apiKey != "" {
		return nil, errors.New("cannot provide both token and apiKey")
	}
	if endpoint == "" {
		endpoint = DEFAULT_ENDPOINT
	}
	if !strings.HasPrefix(endpoint, "http") {
		endpoint = "https://" + endpoint
	}

	if sessionWaitSec <= 0 {
		sessionWaitSec = DEFAULT_SESSION_WAIT_SECONDS
	}
	if readTimeoutSec <= 0 {
		readTimeoutSec = DEFAULT_WS_READ_SECONDS
	}

	/*──── 1. POST /sql/session ────*/
	headers := map[string]string{"User-Agent": userAgent}
	if token != "" {
		headers["Authorization"] = "Bearer " + token
	} else {
		headers["X-API-Key"] = apiKey
	}

	sessionURL, err := createSession(endpoint, runtime, region, headers)
	if err != nil {
		return nil, err
	}

	wsBaseURL, err := waitUntilReady(ctx, sessionURL, headers)
	if err != nil {
		return nil, err
	}

	/*──── 3. WebSocket dial ────*/
	wsURL := httpToWS(wsBaseURL) + "/" + PROTOCOL_VERSION

	d := websocket.Dialer{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
	}
	reqHeader := http.Header{}
	for k, v := range headers {
		reqHeader.Set(k, v)
	}

	wsConn, _, err := d.Dial(wsURL, reqHeader)
	if err != nil {
		return nil, err
	}
	wsConn.SetReadLimit(MAX_WEBSOCKET_MESSAGE_BYTES)

	conn := &Connection{
		ws:          wsConn,
		readTimeout: time.Duration(readTimeoutSec) * time.Second,
		queries:     make(map[string]*Query),
		done:        make(chan struct{}),
		ctx:         ctx,
	}
	conn.wg.Add(1)
	go conn.backgroundLoop()
	return conn, nil
}

func createSession(host string, rt Runtime, rg Region, hdr map[string]string) (string, error) {
	u := host + "/sql/session?region=" + string(rg) + "&reuse_session=true"
	body, _ := json.Marshal(map[string]any{"runtimeId": rt})

	req, _ := http.NewRequest("POST", u, bytes.NewReader(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		slurp, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("create session failed: %s", slurp)
	}
	return resp.Request.URL.String(), nil // /sql/session/{id}
}

func waitUntilReady(ctx context.Context, sessURL string, hdr map[string]string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}

		req, _ := http.NewRequestWithContext(ctx, "GET", sessURL, nil)
		for k, v := range hdr {
			req.Header.Set(k, v)
		}
		resp, err := client.Do(req)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var meta struct {
			Status string                 `json:"status"`
			App    map[string]interface{} `json:"appMeta"`
		}
		_ = json.Unmarshal(data, &meta)
		if meta.Status == "READY" {
			if urlStr, ok := meta.App["url"].(string); ok {
				return urlStr, nil
			}
			return "", errors.New("READY but missing url")
		}
		time.Sleep(2 * time.Second)
	}
}

func uuid() string { return fmt.Sprintf("%d", time.Now().UnixNano()) }

func httpToWS(u string) string {
	parsed, _ := url.Parse(u)
	if parsed.Scheme == "https" {
		parsed.Scheme = "wss"
	} else {
		parsed.Scheme = "ws"
	}
	return parsed.String()
}
