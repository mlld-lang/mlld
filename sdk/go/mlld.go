// Package mlld provides a Go wrapper around the mlld CLI.
//
// Example:
//
//	client := mlld.New()
//	output, err := client.Process(`/var @name = "World"
//	Hello, @name!`, nil)
//	// output: "Hello, World!"
package mlld

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Client wraps the mlld CLI.
type Client struct {
	// Command to invoke mlld. Defaults to "mlld".
	Command string

	// CommandArgs are prepended before live transport args.
	// Example: command="node", commandArgs=["./dist/cli.cjs"].
	CommandArgs []string

	// Default timeout for operations. Zero means no timeout.
	Timeout time.Duration

	// Working directory for script execution.
	WorkingDir string

	mu          sync.Mutex
	writeMu     sync.Mutex
	liveCmd     *exec.Cmd
	liveIn      io.WriteCloser
	livePending map[uint64]chan liveMessage
	liveStderr  bytes.Buffer
	nextID      uint64
}

type liveMessageKind string

const (
	liveMessageEvent  liveMessageKind = "event"
	liveMessageResult liveMessageKind = "result"
	liveMessageClosed liveMessageKind = "closed"
)

type liveMessage struct {
	kind    liveMessageKind
	payload map[string]any
	err     error
}

type liveRequest struct {
	Method string `json:"method"`
	ID     any    `json:"id,omitempty"`
	Params any    `json:"params,omitempty"`
}

// New creates a Client with default settings.
func New() *Client {
	return &Client{
		Command: "mlld",
		Timeout: 30 * time.Second,
	}
}

// Close stops the persistent live RPC transport.
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.resetLiveLocked()
}

// ProcessOptions configures a Process call.
type ProcessOptions struct {
	// FilePath provides context for relative imports.
	FilePath string

	// Payload is injected as @payload in the script.
	Payload any

	// State is injected as @state in the script.
	State map[string]any

	// DynamicModules are injected as importable modules.
	DynamicModules map[string]any

	// DynamicModuleSource adds src:{source} labels to injected modules.
	DynamicModuleSource string

	// Mode sets strict|markdown parsing mode.
	Mode string

	// AllowAbsolutePaths enables absolute path access when true.
	AllowAbsolutePaths *bool

	// Timeout overrides the client default.
	Timeout time.Duration
}

// ExecuteOptions configures an Execute call.
type ExecuteOptions struct {
	// State is injected as @state in the script.
	State map[string]any

	// DynamicModules are injected as importable modules.
	DynamicModules map[string]any

	// DynamicModuleSource adds src:{source} labels to injected modules.
	DynamicModuleSource string

	// AllowAbsolutePaths enables absolute path access when true.
	AllowAbsolutePaths *bool

	// Mode sets strict|markdown parsing mode.
	Mode string

	// Timeout overrides the client default.
	Timeout time.Duration
}

// ExecuteResult contains structured output from Execute.
type ExecuteResult struct {
	Output      string       `json:"output"`
	StateWrites []StateWrite `json:"stateWrites,omitempty"`
	Exports     any          `json:"exports,omitempty"` // Can be array or object depending on mlld output
	Effects     []Effect     `json:"effects,omitempty"`
	Metrics     *Metrics     `json:"metrics,omitempty"`
}

// Effect represents an output effect from execution.
type Effect struct {
	Type     string         `json:"type"`
	Content  string         `json:"content,omitempty"`
	Security map[string]any `json:"security,omitempty"`
}

// StateWrite represents a write to the state:// protocol.
type StateWrite struct {
	Path      string    `json:"path"`
	Value     any       `json:"value"`
	Timestamp time.Time `json:"timestamp"`
}

// Metrics contains execution statistics.
type Metrics struct {
	TotalMs    float64 `json:"totalMs"`
	ParseMs    float64 `json:"parseMs"`
	EvaluateMs float64 `json:"evaluateMs"`
}

// AnalyzeResult contains static analysis of an mlld module.
type AnalyzeResult struct {
	Filepath    string          `json:"filepath"`
	Valid       bool            `json:"valid"`
	Errors      []AnalysisError `json:"errors,omitempty"`
	Executables []Executable    `json:"executables,omitempty"`
	Exports     []string        `json:"exports,omitempty"`
	Imports     []Import        `json:"imports,omitempty"`
	Guards      []Guard         `json:"guards,omitempty"`
	Needs       *Needs          `json:"needs,omitempty"`
}

type AnalysisError struct {
	Message string `json:"message"`
	Line    int    `json:"line,omitempty"`
	Column  int    `json:"column,omitempty"`
}

type Executable struct {
	Name   string   `json:"name"`
	Params []string `json:"params,omitempty"`
	Labels []string `json:"labels,omitempty"`
}

type Import struct {
	From  string   `json:"from"`
	Names []string `json:"names,omitempty"`
}

type Guard struct {
	Name   string `json:"name"`
	Timing string `json:"timing"`
	Label  string `json:"label,omitempty"`
}

type Needs struct {
	Cmd  []string `json:"cmd,omitempty"`
	Node []string `json:"node,omitempty"`
	Py   []string `json:"py,omitempty"`
}

type requestHandle struct {
	client     *Client
	requestID  uint64
	responseCh <-chan liveMessage
	timeout    time.Duration

	once        sync.Once
	result      map[string]any
	stateWrites []StateWrite
	err         error
}

func (h *requestHandle) wait() (map[string]any, []StateWrite, error) {
	h.once.Do(func() {
		h.result, h.stateWrites, h.err = h.client.awaitRequest(h.requestID, h.responseCh, h.timeout)
	})
	return h.result, h.stateWrites, h.err
}

func (h *requestHandle) cancel() {
	h.client.sendCancel(h.requestID)
}

func (h *requestHandle) updateState(path string, value any) error {
	return h.client.updateState(h.requestID, path, value, h.timeout)
}

// ProcessHandle represents an in-flight process request.
type ProcessHandle struct {
	request *requestHandle
}

// RequestID returns the live request identifier.
func (h *ProcessHandle) RequestID() uint64 {
	return h.request.requestID
}

// Cancel requests graceful cancellation of the in-flight execution.
func (h *ProcessHandle) Cancel() {
	h.request.cancel()
}

// UpdateState sends a state:update request for this in-flight execution.
func (h *ProcessHandle) UpdateState(path string, value any) error {
	return h.request.updateState(path, value)
}

// Wait blocks until completion and returns the process output.
func (h *ProcessHandle) Wait() (string, error) {
	return h.Result()
}

// Result blocks until completion and returns the process output.
func (h *ProcessHandle) Result() (string, error) {
	result, _, err := h.request.wait()
	if err != nil {
		return "", err
	}
	return extractOutput(result), nil
}

// ExecuteHandle represents an in-flight execute request.
type ExecuteHandle struct {
	request *requestHandle
}

// RequestID returns the live request identifier.
func (h *ExecuteHandle) RequestID() uint64 {
	return h.request.requestID
}

// Cancel requests graceful cancellation of the in-flight execution.
func (h *ExecuteHandle) Cancel() {
	h.request.cancel()
}

// UpdateState sends a state:update request for this in-flight execution.
func (h *ExecuteHandle) UpdateState(path string, value any) error {
	return h.request.updateState(path, value)
}

// Wait blocks until completion and returns the execute result.
func (h *ExecuteHandle) Wait() (*ExecuteResult, error) {
	return h.Result()
}

// Result blocks until completion and returns the execute result.
func (h *ExecuteHandle) Result() (*ExecuteResult, error) {
	result, stateWriteEvents, err := h.request.wait()
	if err != nil {
		return nil, err
	}
	return decodeExecuteResult(result, stateWriteEvents)
}

// Process executes an mlld script string and returns the output.
func (c *Client) Process(script string, opts *ProcessOptions) (string, error) {
	handle, err := c.ProcessAsync(script, opts)
	if err != nil {
		return "", err
	}
	return handle.Result()
}

// ProcessAsync executes an mlld script string and returns an in-flight handle.
func (c *Client) ProcessAsync(script string, opts *ProcessOptions) (*ProcessHandle, error) {
	if opts == nil {
		opts = &ProcessOptions{}
	}

	params := map[string]any{
		"script": script,
	}
	if opts.FilePath != "" {
		params["filePath"] = opts.FilePath
	}
	if opts.Payload != nil {
		params["payload"] = opts.Payload
	}
	if opts.State != nil {
		params["state"] = opts.State
	}
	if opts.DynamicModules != nil {
		params["dynamicModules"] = opts.DynamicModules
	}
	if opts.DynamicModuleSource != "" {
		params["dynamicModuleSource"] = opts.DynamicModuleSource
	}
	if opts.Mode != "" {
		params["mode"] = opts.Mode
	}
	if opts.AllowAbsolutePaths != nil {
		params["allowAbsolutePaths"] = *opts.AllowAbsolutePaths
	}

	requestID, responseCh, err := c.startRequest("process", params)
	if err != nil {
		return nil, err
	}

	return &ProcessHandle{
		request: &requestHandle{
			client:     c,
			requestID:  requestID,
			responseCh: responseCh,
			timeout:    c.resolveTimeout(opts.Timeout),
		},
	}, nil
}

// Execute runs an mlld file with a payload and optional state.
func (c *Client) Execute(filepath string, payload any, opts *ExecuteOptions) (*ExecuteResult, error) {
	handle, err := c.ExecuteAsync(filepath, payload, opts)
	if err != nil {
		return nil, err
	}
	return handle.Result()
}

// ExecuteAsync runs an mlld file with a payload and optional state and returns an in-flight handle.
func (c *Client) ExecuteAsync(filepath string, payload any, opts *ExecuteOptions) (*ExecuteHandle, error) {
	if opts == nil {
		opts = &ExecuteOptions{}
	}

	params := map[string]any{
		"filepath": filepath,
	}
	if payload != nil {
		params["payload"] = payload
	}
	if opts.State != nil {
		params["state"] = opts.State
	}
	if opts.DynamicModules != nil {
		params["dynamicModules"] = opts.DynamicModules
	}
	if opts.DynamicModuleSource != "" {
		params["dynamicModuleSource"] = opts.DynamicModuleSource
	}
	if opts.AllowAbsolutePaths != nil {
		params["allowAbsolutePaths"] = *opts.AllowAbsolutePaths
	}
	if opts.Mode != "" {
		params["mode"] = opts.Mode
	}

	requestID, responseCh, err := c.startRequest("execute", params)
	if err != nil {
		return nil, err
	}

	return &ExecuteHandle{
		request: &requestHandle{
			client:     c,
			requestID:  requestID,
			responseCh: responseCh,
			timeout:    c.resolveTimeout(opts.Timeout),
		},
	}, nil
}

// Analyze performs static analysis on an mlld module without executing it.
func (c *Client) Analyze(filepath string) (*AnalyzeResult, error) {
	result, _, err := c.call("analyze", map[string]any{"filepath": filepath}, 0)
	if err != nil {
		return nil, err
	}

	payloadResult := stripResultID(result)
	serialized, err := json.Marshal(payloadResult)
	if err != nil {
		return nil, fmt.Errorf("marshal analyze result: %w", err)
	}

	var parsed AnalyzeResult
	if err := json.Unmarshal(serialized, &parsed); err != nil {
		return nil, fmt.Errorf("parse analysis result: %w", err)
	}

	return &parsed, nil
}

func (c *Client) resolveTimeout(timeout time.Duration) time.Duration {
	if timeout > 0 {
		return timeout
	}
	return c.Timeout
}

func (c *Client) call(method string, params any, timeout time.Duration) (map[string]any, []StateWrite, error) {
	requestID, responseCh, err := c.startRequest(method, params)
	if err != nil {
		return nil, nil, err
	}
	return c.awaitRequest(requestID, responseCh, timeout)
}

func (c *Client) startRequest(method string, params any) (uint64, <-chan liveMessage, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.ensureLiveLocked(); err != nil {
		return 0, nil, err
	}

	requestID := c.nextRequestIDLocked()
	responseCh := make(chan liveMessage, 128)
	c.livePending[requestID] = responseCh

	if err := c.writeRequestLocked(liveRequest{Method: method, ID: requestID, Params: params}); err != nil {
		delete(c.livePending, requestID)
		stderr := strings.TrimSpace(c.liveStderr.String())
		_ = c.resetLiveLocked()
		return 0, nil, &Error{
			Code:    "TRANSPORT_ERROR",
			Message: chooseMessage(stderr, fmt.Sprintf("write request failed: %v", err)),
			Err:     err,
		}
	}

	return requestID, responseCh, nil
}

func (c *Client) awaitRequest(requestID uint64, responseCh <-chan liveMessage, timeout time.Duration) (map[string]any, []StateWrite, error) {
	stateWriteEvents := make([]StateWrite, 0)
	var timer *time.Timer
	if timeout > 0 {
		timer = time.NewTimer(timeout)
		defer timer.Stop()
	}

	for {
		select {
		case message := <-responseCh:
			switch message.kind {
			case liveMessageEvent:
				if write, ok := parseStateWriteEvent(message.payload); ok {
					stateWriteEvents = append(stateWriteEvents, write)
				}
				continue
			case liveMessageResult:
				if payload, ok := asMap(message.payload["error"]); ok {
					return nil, stateWriteEvents, c.errorFromPayload(payload)
				}
				return message.payload, stateWriteEvents, nil
			case liveMessageClosed:
				stderr := strings.TrimSpace(c.liveStderr.String())
				err := message.err
				if err == nil {
					err = io.EOF
				}
				return nil, stateWriteEvents, &Error{
					Code:    "TRANSPORT_ERROR",
					Message: chooseMessage(stderr, fmt.Sprintf("live transport closed: %v", err)),
					Err:     err,
				}
			default:
				continue
			}
		case <-timerChan(timer):
			c.sendCancel(requestID)
			c.removePendingRequest(requestID)
			return nil, stateWriteEvents, &Error{
				Code:    "TIMEOUT",
				Message: fmt.Sprintf("request timeout after %s", timeout),
				Err:     context.DeadlineExceeded,
			}
		}
	}
}

func (c *Client) updateState(requestID uint64, path string, value any, timeout time.Duration) error {
	if strings.TrimSpace(path) == "" {
		return &Error{Code: "INVALID_REQUEST", Message: "state update path is required"}
	}

	params := map[string]any{
		"requestId": requestID,
		"path":      path,
		"value":     value,
	}

	resolvedTimeout := c.resolveTimeout(timeout)
	maxWait := resolvedTimeout
	if maxWait <= 0 {
		maxWait = 2 * time.Second
	}
	deadline := time.Now().Add(maxWait)

	for {
		_, _, err := c.call("state:update", params, resolvedTimeout)
		if err == nil {
			return nil
		}

		var requestErr *Error
		if !errors.As(err, &requestErr) || requestErr.Code != "REQUEST_NOT_FOUND" {
			return err
		}

		if time.Now().After(deadline) {
			return err
		}

		time.Sleep(25 * time.Millisecond)
	}
}

func (c *Client) sendCancel(requestID uint64) {
	_ = c.sendControlRequest(liveRequest{Method: "cancel", ID: requestID})
}

func (c *Client) sendControlRequest(request liveRequest) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.liveIn == nil {
		return fmt.Errorf("live transport is not available")
	}

	return c.writeRequestLocked(request)
}

func (c *Client) removePendingRequest(requestID uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.livePending == nil {
		return
	}
	delete(c.livePending, requestID)
}

func (c *Client) ensureLiveLocked() error {
	if c.liveCmd != nil && c.liveIn != nil && c.livePending != nil {
		return nil
	}

	args := append([]string{}, c.CommandArgs...)
	args = append(args, "live", "--stdio")

	cmd := exec.Command(c.Command, args...)
	if c.WorkingDir != "" {
		cmd.Dir = c.WorkingDir
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("create live stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create live stdout pipe: %w", err)
	}

	c.liveStderr.Reset()
	cmd.Stderr = &c.liveStderr

	if err := cmd.Start(); err != nil {
		return &Error{
			Code:    "TRANSPORT_ERROR",
			Message: chooseMessage(strings.TrimSpace(c.liveStderr.String()), err.Error()),
			Err:     err,
		}
	}

	c.liveCmd = cmd
	c.liveIn = stdin
	c.livePending = make(map[uint64]chan liveMessage)
	go c.readLoop(stdout)
	return nil
}

func (c *Client) readLoop(stdout io.Reader) {
	reader := bufio.NewReader(stdout)

	for {
		line, err := reader.ReadBytes('\n')
		trimmed := bytes.TrimSpace(line)
		if len(trimmed) > 0 {
			var payload map[string]any
			if parseErr := json.Unmarshal(trimmed, &payload); parseErr != nil {
				c.failAllPending(fmt.Errorf("parse live response: %w", parseErr))
				return
			}

			if event, ok := asMap(payload["event"]); ok {
				if requestID, ok := valueToRequestID(event["id"]); ok {
					c.dispatchPending(requestID, liveMessage{kind: liveMessageEvent, payload: event}, false)
				}
			}

			if result, ok := asMap(payload["result"]); ok {
				if requestID, ok := valueToRequestID(result["id"]); ok {
					c.dispatchPending(requestID, liveMessage{kind: liveMessageResult, payload: result}, true)
				}
			}
		}

		if err != nil {
			if err == io.EOF {
				c.failAllPending(io.EOF)
			} else {
				c.failAllPending(err)
			}
			return
		}
	}
}

func (c *Client) dispatchPending(requestID uint64, message liveMessage, complete bool) {
	c.mu.Lock()
	if c.livePending == nil {
		c.mu.Unlock()
		return
	}
	ch, ok := c.livePending[requestID]
	if ok && complete {
		delete(c.livePending, requestID)
	}
	c.mu.Unlock()

	if !ok {
		return
	}

	select {
	case ch <- message:
	default:
	}
}

func (c *Client) failAllPending(err error) {
	c.mu.Lock()
	pending := c.livePending
	c.livePending = nil
	c.liveCmd = nil
	c.liveIn = nil
	c.mu.Unlock()

	for _, ch := range pending {
		select {
		case ch <- liveMessage{kind: liveMessageClosed, err: err}:
		default:
		}
	}
}

func (c *Client) writeRequestLocked(request liveRequest) error {
	if c.liveIn == nil {
		return fmt.Errorf("live transport is not available")
	}

	payload, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if _, err := c.liveIn.Write(append(payload, '\n')); err != nil {
		return fmt.Errorf("send request: %w", err)
	}

	return nil
}

func (c *Client) nextRequestIDLocked() uint64 {
	c.nextID++
	return c.nextID
}

func (c *Client) resetLiveLocked() error {
	var firstErr error

	if c.livePending != nil {
		for _, ch := range c.livePending {
			select {
			case ch <- liveMessage{kind: liveMessageClosed, err: io.EOF}:
			default:
			}
		}
	}
	c.livePending = nil

	if c.liveIn != nil {
		if err := c.liveIn.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	if c.liveCmd != nil {
		if c.liveCmd.Process != nil {
			_ = c.liveCmd.Process.Kill()
		}
		if err := c.liveCmd.Wait(); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	c.liveCmd = nil
	c.liveIn = nil
	return firstErr
}

func (c *Client) errorFromPayload(payload map[string]any) error {
	message := "mlld request failed"
	if raw, ok := payload["message"]; ok {
		message = fmt.Sprintf("%v", raw)
	}

	code := "RUNTIME_ERROR"
	if raw, ok := payload["code"].(string); ok && raw != "" {
		code = raw
	}

	return &Error{
		Code:    code,
		Message: message,
	}
}

func decodeExecuteResult(result map[string]any, stateWriteEvents []StateWrite) (*ExecuteResult, error) {
	payloadResult := stripResultID(result)
	serialized, err := json.Marshal(payloadResult)
	if err != nil {
		return nil, fmt.Errorf("marshal execute result: %w", err)
	}

	var executeResult ExecuteResult
	if err := json.Unmarshal(serialized, &executeResult); err != nil {
		// If JSON parsing fails, treat output as plain text.
		executeResult.Output = string(serialized)
	}

	executeResult.StateWrites = mergeStateWrites(executeResult.StateWrites, stateWriteEvents)
	return &executeResult, nil
}

func stripResultID(result map[string]any) map[string]any {
	payloadResult := make(map[string]any, len(result))
	for key, value := range result {
		if key == "id" {
			continue
		}
		payloadResult[key] = value
	}
	return payloadResult
}

func extractOutput(result map[string]any) string {
	if output, ok := result["output"].(string); ok {
		return output
	}
	if value, exists := result["output"]; exists {
		return fmt.Sprintf("%v", value)
	}
	if value, exists := result["value"]; exists {
		return fmt.Sprintf("%v", value)
	}
	return ""
}

func asMap(value any) (map[string]any, bool) {
	mapped, ok := value.(map[string]any)
	return mapped, ok
}

func valueToRequestID(raw any) (uint64, bool) {
	switch value := raw.(type) {
	case float64:
		return uint64(value), true
	case int:
		return uint64(value), true
	case int64:
		return uint64(value), true
	case uint64:
		return value, true
	case json.Number:
		parsed, err := value.Int64()
		if err != nil || parsed < 0 {
			return 0, false
		}
		return uint64(parsed), true
	case string:
		parsed, err := strconv.ParseUint(value, 10, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func parseStateWriteEvent(event map[string]any) (StateWrite, bool) {
	eventType, _ := event["type"].(string)
	if eventType != "state:write" {
		return StateWrite{}, false
	}

	writePayload, ok := asMap(event["write"])
	if !ok {
		return StateWrite{}, false
	}

	path, _ := writePayload["path"].(string)
	if path == "" {
		return StateWrite{}, false
	}

	stateWrite := StateWrite{
		Path:  path,
		Value: writePayload["value"],
	}

	if timestamp, ok := writePayload["timestamp"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339Nano, timestamp); err == nil {
			stateWrite.Timestamp = parsed
		}
	}

	return stateWrite, true
}

func mergeStateWrites(resultWrites []StateWrite, eventWrites []StateWrite) []StateWrite {
	if len(eventWrites) == 0 {
		return resultWrites
	}
	if len(resultWrites) == 0 {
		return eventWrites
	}

	merged := make([]StateWrite, 0, len(resultWrites)+len(eventWrites))
	seen := make(map[string]struct{}, len(resultWrites)+len(eventWrites))

	appendUnique := func(write StateWrite) {
		key := stateWriteKey(write)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		merged = append(merged, write)
	}

	for _, write := range resultWrites {
		appendUnique(write)
	}
	for _, write := range eventWrites {
		appendUnique(write)
	}

	return merged
}

func stateWriteKey(write StateWrite) string {
	valueJSON, err := json.Marshal(write.Value)
	if err != nil {
		valueJSON = []byte(fmt.Sprintf("%v", write.Value))
	}
	return fmt.Sprintf("%s|%s", write.Path, string(valueJSON))
}

func timerChan(timer *time.Timer) <-chan time.Time {
	if timer == nil {
		return nil
	}
	return timer.C
}

func chooseMessage(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return "mlld request failed"
}

// Error wraps mlld execution errors.
type Error struct {
	Code    string
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return "mlld error"
}

func (e *Error) Unwrap() error {
	return e.Err
}
