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
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
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

	// Heap sets the Node heap limit for the mlld subprocess, e.g. "8g" or "8192".
	Heap string

	// HeapSnapshotNearLimit enables V8 heap snapshots near the heap limit.
	HeapSnapshotNearLimit int

	mu          sync.Mutex
	writeMu     sync.Mutex
	liveCmd     *exec.Cmd
	liveIn      io.WriteCloser
	livePending map[uint64]chan liveMessage
	liveStderr  bytes.Buffer
	nextID      uint64
}

var (
	defaultClientMu sync.Mutex
	defaultClient   *Client
)

type liveMessageKind string

const (
	liveMessageEvent  liveMessageKind = "event"
	liveMessageResult liveMessageKind = "result"
	liveMessageClosed liveMessageKind = "closed"
)

type liveMessage struct {
	kind    liveMessageKind
	payload any
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

// DefaultClient returns the lazily initialized package-level client.
func DefaultClient() *Client {
	defaultClientMu.Lock()
	defer defaultClientMu.Unlock()

	if defaultClient == nil {
		defaultClient = New()
	}

	return defaultClient
}

// CloseDefaultClient closes and clears the lazily initialized package-level client.
func CloseDefaultClient() error {
	defaultClientMu.Lock()
	client := defaultClient
	defaultClient = nil
	defaultClientMu.Unlock()

	if client == nil {
		return nil
	}

	return client.Close()
}

// Process executes a script using the package-level default client.
func Process(script string, opts *ProcessOptions) (string, error) {
	return DefaultClient().Process(script, opts)
}

// ProcessAsync executes a script using the package-level default client.
func ProcessAsync(script string, opts *ProcessOptions) (*ProcessHandle, error) {
	return DefaultClient().ProcessAsync(script, opts)
}

// Execute runs a file using the package-level default client.
func Execute(filepath string, payload any, opts *ExecuteOptions) (*ExecuteResult, error) {
	return DefaultClient().Execute(filepath, payload, opts)
}

// ExecuteAsync runs a file using the package-level default client.
func ExecuteAsync(filepath string, payload any, opts *ExecuteOptions) (*ExecuteHandle, error) {
	return DefaultClient().ExecuteAsync(filepath, payload, opts)
}

// Analyze performs static analysis using the package-level default client.
func Analyze(filepath string) (*AnalyzeResult, error) {
	return DefaultClient().Analyze(filepath)
}

// FSStatus returns filesystem signature status using the package-level default client.
func FSStatus(glob string, opts *FSStatusOptions) ([]FilesystemStatus, error) {
	return DefaultClient().FSStatus(glob, opts)
}

// Sign signs a file using the package-level default client.
func Sign(path string, opts *SignOptions) (*FileVerifyResult, error) {
	return DefaultClient().Sign(path, opts)
}

// Verify verifies a file using the package-level default client.
func Verify(path string, opts *VerifyOptions) (*FileVerifyResult, error) {
	return DefaultClient().Verify(path, opts)
}

// SignContent signs runtime content using the package-level default client.
func SignContent(content string, identity string, opts *SignContentOptions) (*ContentSignature, error) {
	return DefaultClient().SignContent(content, identity, opts)
}

// ProcessOptions configures a Process call.
type ProcessOptions struct {
	// FilePath provides context for relative imports.
	FilePath string

	// Payload is injected as @payload in the script.
	Payload any

	// PayloadLabels applies per-field security labels to @payload object fields.
	PayloadLabels map[string][]string

	// State is injected as @state in the script.
	State map[string]any

	// DynamicModules are injected as importable modules.
	DynamicModules map[string]any

	// DynamicModuleSource adds src:{source} labels to injected modules.
	DynamicModuleSource string

	// McpServers maps logical server names to MCP server commands.
	McpServers map[string]string

	// Mode sets strict|markdown parsing mode.
	Mode string

	// AllowAbsolutePaths enables absolute path access when true.
	AllowAbsolutePaths *bool

	// Trace enables runtime effect tracing: off|effects|verbose.
	Trace string

	// TraceMemory includes memory samples in runtime trace events.
	TraceMemory bool

	// TraceFile writes runtime trace events as JSONL.
	TraceFile string

	// TraceStderr mirrors runtime trace events to stderr.
	TraceStderr bool

	// Timeout overrides the client default.
	Timeout time.Duration
}

// ExecuteOptions configures an Execute call.
type ExecuteOptions struct {
	// PayloadLabels applies per-field security labels to @payload object fields.
	PayloadLabels map[string][]string

	// State is injected as @state in the script.
	State map[string]any

	// DynamicModules are injected as importable modules.
	DynamicModules map[string]any

	// DynamicModuleSource adds src:{source} labels to injected modules.
	DynamicModuleSource string

	// McpServers maps logical server names to MCP server commands.
	McpServers map[string]string

	// AllowAbsolutePaths enables absolute path access when true.
	AllowAbsolutePaths *bool

	// Mode sets strict|markdown parsing mode.
	Mode string

	// Trace enables runtime effect tracing: off|effects|verbose.
	Trace string

	// TraceMemory includes memory samples in runtime trace events.
	TraceMemory bool

	// TraceFile writes runtime trace events as JSONL.
	TraceFile string

	// TraceStderr mirrors runtime trace events to stderr.
	TraceStderr bool

	// Timeout overrides the client default.
	Timeout time.Duration
}

// FSStatusOptions configures an FSStatus call.
type FSStatusOptions struct {
	// BasePath overrides the project-relative resolution base.
	BasePath string

	// Timeout overrides the client default.
	Timeout time.Duration
}

// SignOptions configures a Sign call.
type SignOptions struct {
	// Identity overrides the signer identity.
	Identity string

	// Metadata persists alongside the file signature.
	Metadata map[string]any

	// BasePath overrides the project-relative resolution base.
	BasePath string

	// Timeout overrides the client default.
	Timeout time.Duration
}

// VerifyOptions configures a Verify call.
type VerifyOptions struct {
	// BasePath overrides the project-relative resolution base.
	BasePath string

	// Timeout overrides the client default.
	Timeout time.Duration
}

// SignContentOptions configures a SignContent call.
type SignContentOptions struct {
	// Metadata persists alongside the content signature.
	Metadata map[string]string

	// SignatureID sets the stable persisted signature identifier.
	SignatureID string

	// BasePath overrides the project-relative resolution base.
	BasePath string

	// Timeout overrides the client default.
	Timeout time.Duration
}

// ExecuteResult contains structured output from Execute.
type ExecuteResult struct {
	Output      string              `json:"output"`
	StateWrites []StateWrite        `json:"stateWrites,omitempty"`
	Sessions    []SessionFinalState `json:"sessions,omitempty"`
	Exports     any                 `json:"exports,omitempty"` // Can be array or object depending on mlld output
	Effects     []Effect            `json:"effects,omitempty"`
	Denials     []GuardDenial       `json:"denials,omitempty"`
	TraceEvents []TraceEvent        `json:"traceEvents,omitempty"`
	Metrics     *Metrics            `json:"metrics,omitempty"`
}

// TraceEvent represents a structured runtime trace event.
type TraceEvent struct {
	TS       string         `json:"ts"`
	Level    string         `json:"level"`
	Category string         `json:"category"`
	Event    string         `json:"event"`
	Scope    map[string]any `json:"scope,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
}

// Effect represents an output effect from execution.
type Effect struct {
	Type     string         `json:"type"`
	Content  string         `json:"content,omitempty"`
	Security map[string]any `json:"security,omitempty"`
}

// GuardDenial represents a structured denied guard/policy decision.
type GuardDenial struct {
	Guard     *string        `json:"guard,omitempty"`
	Operation string         `json:"operation"`
	Reason    string         `json:"reason"`
	Rule      *string        `json:"rule,omitempty"`
	Labels    []string       `json:"labels,omitempty"`
	Args      map[string]any `json:"args,omitempty"`
}

// HandleEvent represents an event from an in-flight execution.
type HandleEvent struct {
	Type         string        `json:"type"`
	StateWrite   *StateWrite   `json:"stateWrite,omitempty"`
	SessionWrite *SessionWrite `json:"sessionWrite,omitempty"`
	GuardDenial  *GuardDenial  `json:"guardDenial,omitempty"`
	TraceEvent   *TraceEvent   `json:"traceEvent,omitempty"`
}

// StateWrite represents a write to the state:// protocol.
type StateWrite struct {
	Path      string         `json:"path"`
	Value     any            `json:"value"`
	Timestamp time.Time      `json:"timestamp"`
	Security  map[string]any `json:"security,omitempty"`
}

// SessionWrite represents an in-flight session write event.
type SessionWrite struct {
	FrameID       string `json:"frame_id"`
	SessionName   string `json:"session_name"`
	DeclarationID string `json:"declaration_id"`
	OriginPath    string `json:"origin_path,omitempty"`
	SlotPath      string `json:"slot_path"`
	Operation     string `json:"operation"`
	Prev          any    `json:"prev,omitempty"`
	Next          any    `json:"next,omitempty"`
}

// SessionFinalState contains the final state for one attached session frame.
type SessionFinalState struct {
	FrameID       string         `json:"frameId"`
	DeclarationID string         `json:"declarationId"`
	Name          string         `json:"name"`
	OriginPath    string         `json:"originPath,omitempty"`
	FinalState    map[string]any `json:"finalState,omitempty"`
}

// Metrics contains execution statistics.
type Metrics struct {
	TotalMs    float64 `json:"totalMs"`
	ParseMs    float64 `json:"parseMs"`
	EvaluateMs float64 `json:"evaluateMs"`
}

// FilesystemStatus contains signature status for a file.
type FilesystemStatus struct {
	Path         string   `json:"path"`
	RelativePath string   `json:"relativePath,omitempty"`
	Status       string   `json:"status"`
	Verified     bool     `json:"verified"`
	Signer       *string  `json:"signer,omitempty"`
	Labels       []string `json:"labels,omitempty"`
	Taint        []string `json:"taint,omitempty"`
	SignedAt     *string  `json:"signedAt,omitempty"`
	Error        *string  `json:"error,omitempty"`
}

// FileVerifyResult contains signature verification metadata for a file.
type FileVerifyResult struct {
	Path         string         `json:"path"`
	RelativePath string         `json:"relativePath,omitempty"`
	Status       string         `json:"status"`
	Verified     bool           `json:"verified"`
	Signer       *string        `json:"signer,omitempty"`
	SignedAt     *string        `json:"signedAt,omitempty"`
	Hash         *string        `json:"hash,omitempty"`
	ExpectedHash *string        `json:"expectedHash,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
	Error        *string        `json:"error,omitempty"`
}

// ContentSignature contains persistent signature metadata for signed content.
type ContentSignature struct {
	ID            string            `json:"id"`
	Hash          string            `json:"hash"`
	Algorithm     string            `json:"algorithm"`
	SignedBy      string            `json:"signedBy"`
	SignedAt      string            `json:"signedAt"`
	ContentLength int               `json:"contentLength"`
	Metadata      map[string]string `json:"metadata,omitempty"`
}

// LabeledValue wraps a payload field with security labels.
type LabeledValue struct {
	Value  any
	Labels []string
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
	Name    string `json:"name"`
	Timing  string `json:"timing"`
	Trigger string `json:"trigger,omitempty"`
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

	mu                   sync.Mutex
	complete             bool
	completeEventEmitted bool
	result               any
	stateWrites          []StateWrite
	guardDenials         []GuardDenial
	err                  error
}

func (h *requestHandle) wait() (any, []StateWrite, []GuardDenial, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.complete {
		if h.err != nil {
			return nil, nil, nil, h.err
		}
		if h.result == nil {
			return nil, nil, nil, &Error{Code: "TRANSPORT_ERROR", Message: "missing live result payload"}
		}
		h.completeEventEmitted = true
		return h.result, append([]StateWrite(nil), h.stateWrites...), append([]GuardDenial(nil), h.guardDenials...), nil
	}

	deadline := time.Time{}
	if h.timeout > 0 {
		deadline = time.Now().Add(h.timeout)
	}

	for {
		message, timedOut := receiveLiveMessage(h.responseCh, remainingDuration(deadline))
		if timedOut {
			h.client.sendCancel(h.requestID)
			h.client.removePendingRequest(h.requestID)
			h.complete = true
			h.completeEventEmitted = true
			h.err = &Error{
				Code:    "TIMEOUT",
				Message: fmt.Sprintf("request timeout after %s", h.timeout),
				Err:     context.DeadlineExceeded,
			}
			return nil, nil, nil, h.err
		}

		if event, ok := h.handleMessageLocked(message); ok {
			if event.Type == "complete" {
				h.completeEventEmitted = true
				return h.result, append([]StateWrite(nil), h.stateWrites...), append([]GuardDenial(nil), h.guardDenials...), nil
			}
			continue
		}

		if h.complete {
			if h.err != nil {
				return nil, nil, nil, h.err
			}
			if h.result == nil {
				return nil, nil, nil, &Error{Code: "TRANSPORT_ERROR", Message: "missing live result payload"}
			}
			h.completeEventEmitted = true
			return h.result, append([]StateWrite(nil), h.stateWrites...), append([]GuardDenial(nil), h.guardDenials...), nil
		}
	}
}

func (h *requestHandle) cancel() {
	h.mu.Lock()
	complete := h.complete
	h.mu.Unlock()
	if complete {
		return
	}
	h.client.sendCancel(h.requestID)
}

func (h *requestHandle) updateState(path string, value any, labels ...string) error {
	h.mu.Lock()
	complete := h.complete
	h.mu.Unlock()
	if complete {
		return &Error{Code: "REQUEST_COMPLETE", Message: "request already completed"}
	}
	return h.client.updateState(h.requestID, path, value, h.timeout, labels)
}

func (h *requestHandle) writeFile(path string, content string, timeout time.Duration) (*FileVerifyResult, error) {
	h.mu.Lock()
	complete := h.complete
	h.mu.Unlock()
	if complete {
		return nil, &Error{Code: "REQUEST_COMPLETE", Message: "request already completed"}
	}
	return h.client.writeFile(h.requestID, path, content, timeout)
}

func (h *requestHandle) nextEvent(timeout time.Duration) (*HandleEvent, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.complete {
		if h.err != nil || h.completeEventEmitted {
			return nil, nil
		}
		h.completeEventEmitted = true
		return &HandleEvent{Type: "complete"}, nil
	}

	deadline := time.Time{}
	if timeout > 0 {
		deadline = time.Now().Add(timeout)
	}

	for {
		message, timedOut := receiveLiveMessage(h.responseCh, remainingDuration(deadline))
		if timedOut {
			return nil, nil
		}

		if event, ok := h.handleMessageLocked(message); ok {
			if event.Type == "complete" {
				h.completeEventEmitted = true
			}
			if h.err != nil {
				return nil, h.err
			}
			return event, nil
		}

		if h.complete {
			if h.err != nil {
				return nil, h.err
			}
			return nil, nil
		}
	}
}

func (h *requestHandle) handleMessageLocked(message liveMessage) (*HandleEvent, bool) {
	switch message.kind {
	case liveMessageEvent:
		if write, ok := parseStateWriteEvent(message.payload); ok {
			h.stateWrites = append(h.stateWrites, write)
			return &HandleEvent{Type: "state_write", StateWrite: &write}, true
		}
		if sessionWrite, ok := parseSessionWriteEvent(message.payload); ok {
			return &HandleEvent{Type: "session_write", SessionWrite: &sessionWrite}, true
		}
		if denial, ok := parseGuardDenialEvent(message.payload); ok {
			h.guardDenials = append(h.guardDenials, denial)
			return &HandleEvent{Type: "guard_denial", GuardDenial: &denial}, true
		}
		if traceEvent, ok := parseTraceEventEvent(message.payload); ok {
			return &HandleEvent{Type: "trace_event", TraceEvent: &traceEvent}, true
		}
		return nil, false
	case liveMessageResult:
		envelope, ok := asMap(message.payload)
		if !ok {
			h.complete = true
			h.completeEventEmitted = true
			h.err = &Error{Code: "TRANSPORT_ERROR", Message: "live response envelope must be an object"}
			return nil, false
		}
		if payload, ok := asMap(envelope["error"]); ok {
			h.complete = true
			h.completeEventEmitted = true
			h.err = h.client.errorFromPayload(payload)
			return nil, true
		}
		if result, ok := envelope["result"]; ok {
			h.result = result
			h.complete = true
			return &HandleEvent{Type: "complete"}, true
		}
		h.complete = true
		h.completeEventEmitted = true
		h.err = &Error{Code: "TRANSPORT_ERROR", Message: "live response envelope missing result"}
		return nil, false
	case liveMessageClosed:
		stderr := strings.TrimSpace(h.client.liveStderr.String())
		err := message.err
		if err == nil {
			err = io.EOF
		}
		h.complete = true
		h.completeEventEmitted = true
		h.err = &Error{
			Code:    "TRANSPORT_ERROR",
			Message: chooseMessage(stderr, fmt.Sprintf("live transport closed: %v", err)),
			Err:     err,
		}
		return nil, false
	default:
		return nil, false
	}
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
func (h *ProcessHandle) UpdateState(path string, value any, labels ...string) error {
	return h.request.updateState(path, value, labels...)
}

// Wait blocks until completion and returns the process output.
func (h *ProcessHandle) Wait() (string, error) {
	return h.Result()
}

// Result blocks until completion and returns the process output.
func (h *ProcessHandle) Result() (string, error) {
	result, _, _, err := h.request.wait()
	if err != nil {
		return "", err
	}
	return extractOutput(result), nil
}

// NextEvent blocks until the next in-flight event. Returns nil on timeout.
func (h *ProcessHandle) NextEvent(timeout ...time.Duration) (*HandleEvent, error) {
	return h.request.nextEvent(resolveHandleTimeout(h.request.timeout, timeout))
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
func (h *ExecuteHandle) UpdateState(path string, value any, labels ...string) error {
	return h.request.updateState(path, value, labels...)
}

// Wait blocks until completion and returns the execute result.
func (h *ExecuteHandle) Wait() (*ExecuteResult, error) {
	return h.Result()
}

// Result blocks until completion and returns the execute result.
func (h *ExecuteHandle) Result() (*ExecuteResult, error) {
	result, stateWriteEvents, guardDenialEvents, err := h.request.wait()
	if err != nil {
		return nil, err
	}
	return decodeExecuteResult(result, stateWriteEvents, guardDenialEvents)
}

// NextEvent blocks until the next in-flight event. Returns nil on timeout.
func (h *ExecuteHandle) NextEvent(timeout ...time.Duration) (*HandleEvent, error) {
	return h.request.nextEvent(resolveHandleTimeout(h.request.timeout, timeout))
}

// WriteFile writes a file within the active execution context and returns its signature status.
func (h *ExecuteHandle) WriteFile(path string, content string, timeout ...time.Duration) (*FileVerifyResult, error) {
	return h.request.writeFile(path, content, resolveHandleTimeout(h.request.timeout, timeout))
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
	params, timeout, err := c.buildProcessRequest(script, opts)
	if err != nil {
		return nil, err
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
			timeout:    timeout,
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
	params, timeout, err := c.buildExecuteRequest(filepath, payload, opts)
	if err != nil {
		return nil, err
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
			timeout:    timeout,
		},
	}, nil
}

func (c *Client) buildProcessRequest(script string, opts *ProcessOptions) (map[string]any, time.Duration, error) {
	if opts == nil {
		opts = &ProcessOptions{}
	}

	normalizedPayload, payloadLabels, err := normalizePayloadAndLabels(opts.Payload, opts.PayloadLabels)
	if err != nil {
		return nil, 0, err
	}

	params := map[string]any{
		"script":        script,
		"recordEffects": true,
	}
	if opts.FilePath != "" {
		params["filePath"] = opts.FilePath
	}
	if normalizedPayload != nil {
		params["payload"] = normalizedPayload
	}
	if len(payloadLabels) > 0 {
		params["payloadLabels"] = payloadLabels
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
	if len(opts.McpServers) > 0 {
		params["mcpServers"] = opts.McpServers
	}
	if opts.Mode != "" {
		params["mode"] = opts.Mode
	}
	if opts.AllowAbsolutePaths != nil {
		params["allowAbsolutePaths"] = *opts.AllowAbsolutePaths
	}
	if opts.Trace != "" {
		params["trace"] = opts.Trace
	}
	if opts.TraceMemory {
		params["traceMemory"] = opts.TraceMemory
	}
	if opts.TraceFile != "" {
		params["traceFile"] = opts.TraceFile
	}
	if opts.TraceStderr {
		params["traceStderr"] = opts.TraceStderr
	}

	return params, c.resolveTimeout(opts.Timeout), nil
}

func (c *Client) buildExecuteRequest(filepath string, payload any, opts *ExecuteOptions) (map[string]any, time.Duration, error) {
	if opts == nil {
		opts = &ExecuteOptions{}
	}

	normalizedPayload, payloadLabels, err := normalizePayloadAndLabels(payload, opts.PayloadLabels)
	if err != nil {
		return nil, 0, err
	}

	params := map[string]any{
		"filepath":      filepath,
		"recordEffects": true,
	}
	if normalizedPayload != nil {
		params["payload"] = normalizedPayload
	}
	if len(payloadLabels) > 0 {
		params["payloadLabels"] = payloadLabels
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
	if len(opts.McpServers) > 0 {
		params["mcpServers"] = opts.McpServers
	}
	if opts.AllowAbsolutePaths != nil {
		params["allowAbsolutePaths"] = *opts.AllowAbsolutePaths
	}
	if opts.Mode != "" {
		params["mode"] = opts.Mode
	}
	if opts.Trace != "" {
		params["trace"] = opts.Trace
	}
	if opts.TraceMemory {
		params["traceMemory"] = opts.TraceMemory
	}
	if opts.TraceFile != "" {
		params["traceFile"] = opts.TraceFile
	}
	if opts.TraceStderr {
		params["traceStderr"] = opts.TraceStderr
	}

	return params, c.resolveTimeout(opts.Timeout), nil
}

// Analyze performs static analysis on an mlld module without executing it.
func (c *Client) Analyze(filepath string) (*AnalyzeResult, error) {
	result, _, err := c.call("analyze", map[string]any{"filepath": filepath}, 0)
	if err != nil {
		return nil, err
	}

	payloadResult, ok := asMap(result)
	if !ok {
		return nil, &Error{
			Code:    "TRANSPORT_ERROR",
			Message: "analyze response payload must be an object",
		}
	}

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

// FSStatus returns filesystem signature/integrity status for tracked files.
func (c *Client) FSStatus(glob string, opts *FSStatusOptions) ([]FilesystemStatus, error) {
	method, params, timeout := c.buildFSStatusRequest(glob, opts)
	result, _, err := c.call(method, params, timeout)
	if err != nil {
		return nil, err
	}

	return decodeFilesystemStatuses(result)
}

// Sign signs a file and returns its verification status.
func (c *Client) Sign(path string, opts *SignOptions) (*FileVerifyResult, error) {
	method, params, timeout := c.buildSignRequest(path, opts)
	result, _, err := c.call(method, params, timeout)
	if err != nil {
		return nil, err
	}

	return decodeFileVerifyResult(result)
}

// Verify verifies a file and returns its signature status.
func (c *Client) Verify(path string, opts *VerifyOptions) (*FileVerifyResult, error) {
	method, params, timeout := c.buildVerifyRequest(path, opts)
	result, _, err := c.call(method, params, timeout)
	if err != nil {
		return nil, err
	}

	return decodeFileVerifyResult(result)
}

// SignContent signs runtime content and persists it in the project's content store.
func (c *Client) SignContent(content string, identity string, opts *SignContentOptions) (*ContentSignature, error) {
	method, params, timeout := c.buildSignContentRequest(content, identity, opts)
	result, _, err := c.call(method, params, timeout)
	if err != nil {
		return nil, err
	}

	return decodeContentSignature(result)
}

func (c *Client) buildFSStatusRequest(glob string, opts *FSStatusOptions) (string, map[string]any, time.Duration) {
	if opts == nil {
		opts = &FSStatusOptions{}
	}

	params := map[string]any{}
	if strings.TrimSpace(glob) != "" {
		params["glob"] = glob
	}
	if opts.BasePath != "" {
		params["basePath"] = opts.BasePath
	}

	return "fs:status", params, c.resolveTimeout(opts.Timeout)
}

func (c *Client) buildSignRequest(path string, opts *SignOptions) (string, map[string]any, time.Duration) {
	if opts == nil {
		opts = &SignOptions{}
	}

	params := map[string]any{
		"path": path,
	}
	if opts.Identity != "" {
		params["identity"] = opts.Identity
	}
	if len(opts.Metadata) > 0 {
		params["metadata"] = opts.Metadata
	}
	if opts.BasePath != "" {
		params["basePath"] = opts.BasePath
	}

	return "sig:sign", params, c.resolveTimeout(opts.Timeout)
}

func (c *Client) buildVerifyRequest(path string, opts *VerifyOptions) (string, map[string]any, time.Duration) {
	if opts == nil {
		opts = &VerifyOptions{}
	}

	params := map[string]any{
		"path": path,
	}
	if opts.BasePath != "" {
		params["basePath"] = opts.BasePath
	}

	return "sig:verify", params, c.resolveTimeout(opts.Timeout)
}

func (c *Client) buildSignContentRequest(content string, identity string, opts *SignContentOptions) (string, map[string]any, time.Duration) {
	if opts == nil {
		opts = &SignContentOptions{}
	}

	params := map[string]any{
		"content":  content,
		"identity": identity,
	}
	if len(opts.Metadata) > 0 {
		params["metadata"] = opts.Metadata
	}
	if opts.SignatureID != "" {
		params["id"] = opts.SignatureID
	}
	if opts.BasePath != "" {
		params["basePath"] = opts.BasePath
	}

	return "sig:sign-content", params, c.resolveTimeout(opts.Timeout)
}

func (c *Client) resolveTimeout(timeout time.Duration) time.Duration {
	if timeout > 0 {
		return timeout
	}
	return c.Timeout
}

func (c *Client) call(method string, params any, timeout time.Duration) (any, []StateWrite, error) {
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

func (c *Client) awaitRequest(requestID uint64, responseCh <-chan liveMessage, timeout time.Duration) (any, []StateWrite, error) {
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
				envelope, ok := asMap(message.payload)
				if !ok {
					return nil, stateWriteEvents, &Error{
						Code:    "TRANSPORT_ERROR",
						Message: "live response envelope must be an object",
					}
				}
				if payload, ok := asMap(envelope["error"]); ok {
					return nil, stateWriteEvents, c.errorFromPayload(payload)
				}
				if result, ok := envelope["result"]; ok {
					return result, stateWriteEvents, nil
				}
				return nil, stateWriteEvents, &Error{
					Code:    "TRANSPORT_ERROR",
					Message: "live response envelope missing result",
				}
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

func (c *Client) updateState(requestID uint64, path string, value any, timeout time.Duration, labels []string) error {
	if strings.TrimSpace(path) == "" {
		return &Error{Code: "INVALID_REQUEST", Message: "state update path is required"}
	}

	params := map[string]any{
		"requestId": requestID,
		"path":      path,
		"value":     value,
	}
	if normalized := normalizeLabels(labels); len(normalized) > 0 {
		params["labels"] = normalized
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

func (c *Client) writeFile(requestID uint64, path string, content string, timeout time.Duration) (*FileVerifyResult, error) {
	if strings.TrimSpace(path) == "" {
		return nil, &Error{Code: "INVALID_REQUEST", Message: "file write path is required"}
	}

	resolvedTimeout := c.resolveTimeout(timeout)
	maxWait := resolvedTimeout
	if maxWait <= 0 {
		maxWait = 2 * time.Second
	}
	deadline := time.Now().Add(maxWait)
	params := map[string]any{
		"requestId": requestID,
		"path":      path,
		"content":   content,
	}

	for {
		result, _, err := c.call("file:write", params, resolvedTimeout)
		if err == nil {
			return decodeFileVerifyResult(result)
		}

		var requestErr *Error
		if !errors.As(err, &requestErr) || requestErr.Code != "REQUEST_NOT_FOUND" {
			return nil, err
		}

		if time.Now().After(deadline) {
			return nil, err
		}

		time.Sleep(25 * time.Millisecond)
	}
}

func normalizeLabelMap(input map[string][]string) map[string][]string {
	if len(input) == 0 {
		return nil
	}

	normalized := make(map[string][]string)
	for key, labels := range input {
		deduped := normalizeLabels(labels)
		if len(deduped) > 0 {
			normalized[key] = deduped
		}
	}

	if len(normalized) == 0 {
		return nil
	}

	return normalized
}

func normalizePayloadAndLabels(payload any, payloadLabels map[string][]string) (any, map[string][]string, error) {
	mergedLabels := make(map[string][]string)
	normalizedPayload := payload

	if payloadMap, ok := payloadAsStringMap(payload); ok {
		normalizedPayload = make(map[string]any, len(payloadMap))
		for key, value := range payloadMap {
			if labeled, ok := asLabeledValue(value); ok {
				normalizedPayload.(map[string]any)[key] = labeled.Value
				if labels := normalizeLabels(labeled.Labels); len(labels) > 0 {
					mergedLabels[key] = labels
				}
				continue
			}
			normalizedPayload.(map[string]any)[key] = value
		}
	} else if len(payloadLabels) > 0 {
		return nil, nil, &Error{
			Code:    "INVALID_REQUEST",
			Message: "payload_labels requires payload to be a map",
		}
	}

	normalizedExplicit := normalizeLabelMap(payloadLabels)
	if len(normalizedExplicit) > 0 {
		payloadMap, ok := normalizedPayload.(map[string]any)
		if !ok {
			return nil, nil, &Error{
				Code:    "INVALID_REQUEST",
				Message: "payload_labels requires payload to be a map",
			}
		}
		for key, labels := range normalizedExplicit {
			if _, exists := payloadMap[key]; !exists {
				return nil, nil, &Error{
					Code:    "INVALID_REQUEST",
					Message: fmt.Sprintf("payload_labels contains unknown field: %s", key),
				}
			}
			mergedLabels[key] = mergeLabels(mergedLabels[key], labels)
		}
	}

	if len(mergedLabels) == 0 {
		mergedLabels = nil
	}

	return normalizedPayload, mergedLabels, nil
}

func payloadAsStringMap(payload any) (map[string]any, bool) {
	if payload == nil {
		return nil, false
	}

	if typed, ok := payload.(map[string]any); ok {
		return typed, true
	}

	value := reflect.ValueOf(payload)
	if value.Kind() != reflect.Map || value.Type().Key().Kind() != reflect.String {
		return nil, false
	}

	converted := make(map[string]any, value.Len())
	iter := value.MapRange()
	for iter.Next() {
		converted[iter.Key().String()] = iter.Value().Interface()
	}
	return converted, true
}

func asLabeledValue(value any) (LabeledValue, bool) {
	switch typed := value.(type) {
	case LabeledValue:
		return typed, true
	case *LabeledValue:
		if typed == nil {
			return LabeledValue{}, false
		}
		return *typed, true
	default:
		return LabeledValue{}, false
	}
}

func mergeLabels(existing []string, incoming []string) []string {
	if len(existing) == 0 {
		return append([]string(nil), incoming...)
	}

	merged := append([]string(nil), existing...)
	seen := make(map[string]struct{}, len(merged))
	for _, label := range merged {
		seen[label] = struct{}{}
	}
	for _, label := range incoming {
		if _, ok := seen[label]; ok {
			continue
		}
		seen[label] = struct{}{}
		merged = append(merged, label)
	}
	return merged
}

// Labeled attaches one or more labels to a payload field value.
func Labeled(value any, labels ...string) LabeledValue {
	return LabeledValue{
		Value:  value,
		Labels: normalizeLabels(labels),
	}
}

// Trusted marks a payload field as trusted.
func Trusted(value any) LabeledValue {
	return Labeled(value, "trusted")
}

// Untrusted marks a payload field as untrusted.
func Untrusted(value any) LabeledValue {
	return Labeled(value, "untrusted")
}

func normalizeLabels(labels []string) []string {
	if len(labels) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(labels))
	normalized := make([]string, 0, len(labels))
	for _, label := range labels {
		trimmed := strings.TrimSpace(label)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	if len(normalized) == 0 {
		return nil
	}

	return normalized
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

	args, err := runtimeStartupArgs(c.Command, c.CommandArgs, c.Heap, c.HeapSnapshotNearLimit)
	if err != nil {
		return err
	}
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

func runtimeStartupArgs(command string, commandArgs []string, heap string, heapSnapshotNearLimit int) ([]string, error) {
	args := append([]string{}, commandArgs...)
	if heap == "" && heapSnapshotNearLimit == 0 {
		return args, nil
	}

	runtimeArgs := make([]string, 0, 4)
	if heap != "" {
		if isNodeCommand(command) {
			heapMB, err := parseHeapToMB(heap)
			if err != nil {
				return nil, err
			}
			runtimeArgs = append(runtimeArgs, fmt.Sprintf("--max-old-space-size=%d", heapMB))
		} else {
			runtimeArgs = append(runtimeArgs, fmt.Sprintf("--mlld-heap=%s", heap))
		}
	}

	if heapSnapshotNearLimit != 0 {
		if heapSnapshotNearLimit < 0 {
			return nil, &Error{Code: "INVALID_REQUEST", Message: "heap snapshot near limit must be a positive integer"}
		}
		if isNodeCommand(command) {
			runtimeArgs = append(runtimeArgs, fmt.Sprintf("--heapsnapshot-near-heap-limit=%d", heapSnapshotNearLimit))
		} else {
			runtimeArgs = append(runtimeArgs, "--heap-snapshot-near-limit", strconv.Itoa(heapSnapshotNearLimit))
		}
	}

	return append(runtimeArgs, args...), nil
}

func isNodeCommand(command string) bool {
	name := strings.ToLower(filepath.Base(command))
	return name == "node" || name == "node.exe" || name == "nodejs" || name == "nodejs.exe"
}

func parseHeapToMB(heap string) (int, error) {
	value := strings.TrimSpace(strings.ToLower(heap))
	match := regexp.MustCompile(`^(\d+(?:\.\d+)?)\s*(m|mb|g|gb)?$`).FindStringSubmatch(value)
	if match == nil {
		return 0, &Error{Code: "INVALID_REQUEST", Message: "heap must be a positive memory size like 8192, 8192m, or 8g"}
	}

	amount, err := strconv.ParseFloat(match[1], 64)
	if err != nil || amount <= 0 {
		return 0, &Error{Code: "INVALID_REQUEST", Message: "heap must be a positive memory size"}
	}

	unit := match[2]
	mb := amount
	if unit == "g" || unit == "gb" {
		mb = amount * 1024
	}
	if mb < 1 {
		return 0, &Error{Code: "INVALID_REQUEST", Message: "heap must resolve to at least 1 MB"}
	}

	return int(mb + 0.5), nil
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
				if requestID, ok := requestIDFromEvent(event); ok {
					c.dispatchPending(requestID, liveMessage{kind: liveMessageEvent, payload: event}, false)
				}
			}

			if hasResponsePayload(payload) {
				if requestID, ok := valueToRequestID(payload["id"]); ok {
					c.dispatchPending(requestID, liveMessage{kind: liveMessageResult, payload: payload}, true)
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

func decodeExecuteResult(result any, stateWriteEvents []StateWrite, guardDenialEvents []GuardDenial) (*ExecuteResult, error) {
	payloadResult, ok := asMap(result)
	if !ok {
		return &ExecuteResult{
			Output:      extractOutput(result),
			StateWrites: stateWriteEvents,
			Denials:     guardDenialEvents,
		}, nil
	}

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
	executeResult.Denials = mergeGuardDenials(executeResult.Denials, guardDenialEvents)
	return &executeResult, nil
}

func decodeFileVerifyResult(result any) (*FileVerifyResult, error) {
	payloadResult, ok := asMap(result)
	if !ok {
		return nil, &Error{
			Code:    "TRANSPORT_ERROR",
			Message: "file verification payload must be an object",
		}
	}

	serialized, err := json.Marshal(payloadResult)
	if err != nil {
		return nil, fmt.Errorf("marshal file verification result: %w", err)
	}

	var verifyResult FileVerifyResult
	if err := json.Unmarshal(serialized, &verifyResult); err != nil {
		return nil, fmt.Errorf("parse file verification result: %w", err)
	}

	return &verifyResult, nil
}

func decodeFilesystemStatuses(result any) ([]FilesystemStatus, error) {
	serialized, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal filesystem statuses: %w", err)
	}

	var statuses []FilesystemStatus
	if err := json.Unmarshal(serialized, &statuses); err != nil {
		return nil, fmt.Errorf("parse filesystem statuses: %w", err)
	}

	return statuses, nil
}

func decodeContentSignature(result any) (*ContentSignature, error) {
	payloadResult, ok := asMap(result)
	if !ok {
		return nil, &Error{
			Code:    "TRANSPORT_ERROR",
			Message: "content signature payload must be an object",
		}
	}

	serialized, err := json.Marshal(payloadResult)
	if err != nil {
		return nil, fmt.Errorf("marshal content signature: %w", err)
	}

	var signature ContentSignature
	if err := json.Unmarshal(serialized, &signature); err != nil {
		return nil, fmt.Errorf("parse content signature: %w", err)
	}

	return &signature, nil
}

func extractOutput(result any) string {
	if payloadResult, ok := asMap(result); ok {
		if output, ok := payloadResult["output"].(string); ok {
			return output
		}
		if value, exists := payloadResult["output"]; exists {
			return fmt.Sprintf("%v", value)
		}
	}
	if result != nil {
		return fmt.Sprintf("%v", result)
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

func requestIDFromEvent(event map[string]any) (uint64, bool) {
	if requestID, ok := valueToRequestID(event["requestId"]); ok {
		return requestID, true
	}
	return valueToRequestID(event["id"])
}

func hasResponsePayload(payload map[string]any) bool {
	_, hasResult := payload["result"]
	_, hasError := payload["error"]
	return hasResult || hasError
}

func looksLikeJSONComposite(value string) bool {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < 2 {
		return false
	}
	return (strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}")) ||
		(strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]"))
}

func receiveLiveMessage(responseCh <-chan liveMessage, timeout time.Duration) (liveMessage, bool) {
	if timeout <= 0 {
		message, ok := <-responseCh
		if !ok {
			return liveMessage{kind: liveMessageClosed, err: io.EOF}, false
		}
		return message, false
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case message, ok := <-responseCh:
		if !ok {
			return liveMessage{kind: liveMessageClosed, err: io.EOF}, false
		}
		return message, false
	case <-timer.C:
		return liveMessage{}, true
	}
}

func resolveHandleTimeout(defaultTimeout time.Duration, overrides []time.Duration) time.Duration {
	if len(overrides) == 0 {
		return defaultTimeout
	}
	return overrides[0]
}

func remainingDuration(deadline time.Time) time.Duration {
	if deadline.IsZero() {
		return 0
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return time.Nanosecond
	}
	return remaining
}

func decodeStateWriteValue(value any) any {
	text, ok := value.(string)
	if !ok || !looksLikeJSONComposite(text) {
		return value
	}

	var decoded any
	if err := json.Unmarshal([]byte(text), &decoded); err != nil {
		return value
	}
	return decoded
}

func parseStateWriteEvent(eventPayload any) (StateWrite, bool) {
	event, ok := asMap(eventPayload)
	if !ok {
		return StateWrite{}, false
	}

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
		Value: decodeStateWriteValue(writePayload["value"]),
	}

	if timestamp, ok := writePayload["timestamp"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339Nano, timestamp); err == nil {
			stateWrite.Timestamp = parsed
		}
	}
	if security, ok := asMap(writePayload["security"]); ok {
		stateWrite.Security = security
	}

	return stateWrite, true
}

func parseSessionWriteEvent(eventPayload any) (SessionWrite, bool) {
	event, ok := asMap(eventPayload)
	if !ok {
		return SessionWrite{}, false
	}

	eventType, _ := event["type"].(string)
	if eventType != "session_write" {
		return SessionWrite{}, false
	}

	payload, ok := asMap(event["session_write"])
	if !ok {
		return SessionWrite{}, false
	}

	frameID, _ := payload["frame_id"].(string)
	sessionName, _ := payload["session_name"].(string)
	declarationID, _ := payload["declaration_id"].(string)
	slotPath, _ := payload["slot_path"].(string)
	operation, _ := payload["operation"].(string)
	if frameID == "" || sessionName == "" || declarationID == "" || slotPath == "" || operation == "" {
		return SessionWrite{}, false
	}

	sessionWrite := SessionWrite{
		FrameID:       frameID,
		SessionName:   sessionName,
		DeclarationID: declarationID,
		SlotPath:      slotPath,
		Operation:     operation,
		Prev:          payload["prev"],
		Next:          payload["next"],
	}
	if originPath, ok := payload["origin_path"].(string); ok {
		sessionWrite.OriginPath = originPath
	}

	return sessionWrite, true
}

func guardDenialFromPayload(payload any) (GuardDenial, bool) {
	entry, ok := asMap(payload)
	if !ok {
		return GuardDenial{}, false
	}

	operation, _ := entry["operation"].(string)
	reason, _ := entry["reason"].(string)
	if operation == "" || reason == "" {
		return GuardDenial{}, false
	}

	denial := GuardDenial{
		Operation: operation,
		Reason:    reason,
	}
	if guard, ok := entry["guard"].(string); ok && guard != "" {
		denial.Guard = &guard
	}
	if rule, ok := entry["rule"].(string); ok && rule != "" {
		denial.Rule = &rule
	}
	if labels, ok := entry["labels"].([]any); ok {
		denial.Labels = make([]string, 0, len(labels))
		for _, label := range labels {
			if text, ok := label.(string); ok {
				denial.Labels = append(denial.Labels, text)
			}
		}
	}
	if args, ok := asMap(entry["args"]); ok {
		denial.Args = args
	}

	return denial, true
}

func parseGuardDenialEvent(eventPayload any) (GuardDenial, bool) {
	event, ok := asMap(eventPayload)
	if !ok {
		return GuardDenial{}, false
	}
	eventType, _ := event["type"].(string)
	if eventType != "guard_denial" {
		return GuardDenial{}, false
	}
	return guardDenialFromPayload(event["guard_denial"])
}

func parseTraceEventEvent(eventPayload any) (TraceEvent, bool) {
	event, ok := asMap(eventPayload)
	if !ok {
		return TraceEvent{}, false
	}
	eventType, _ := event["type"].(string)
	if eventType != "trace_event" {
		return TraceEvent{}, false
	}

	payload, ok := asMap(event["traceEvent"])
	if !ok {
		return TraceEvent{}, false
	}

	traceEvent := TraceEvent{}
	if ts, ok := payload["ts"].(string); ok {
		traceEvent.TS = ts
	}
	if level, ok := payload["level"].(string); ok {
		traceEvent.Level = level
	}
	if category, ok := payload["category"].(string); ok {
		traceEvent.Category = category
	}
	if name, ok := payload["event"].(string); ok {
		traceEvent.Event = name
	}
	if scope, ok := asMap(payload["scope"]); ok {
		traceEvent.Scope = scope
	} else {
		traceEvent.Scope = map[string]any{}
	}
	if data, ok := asMap(payload["data"]); ok {
		traceEvent.Data = data
	} else {
		traceEvent.Data = map[string]any{}
	}

	return traceEvent, true
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

func mergeGuardDenials(primary []GuardDenial, secondary []GuardDenial) []GuardDenial {
	if len(secondary) == 0 {
		return primary
	}
	if len(primary) == 0 {
		return secondary
	}

	merged := make([]GuardDenial, 0, len(primary)+len(secondary))
	seen := make(map[string]struct{}, len(primary)+len(secondary))

	appendUnique := func(denial GuardDenial) {
		key := guardDenialKey(denial)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		merged = append(merged, denial)
	}

	for _, denial := range primary {
		appendUnique(denial)
	}
	for _, denial := range secondary {
		appendUnique(denial)
	}

	return merged
}

func guardDenialKey(denial GuardDenial) string {
	labels := append([]string(nil), denial.Labels...)
	sort.Strings(labels)
	argsJSON, err := json.Marshal(denial.Args)
	if err != nil {
		argsJSON = []byte(fmt.Sprintf("%v", denial.Args))
	}

	guard := ""
	if denial.Guard != nil {
		guard = *denial.Guard
	}
	rule := ""
	if denial.Rule != nil {
		rule = *denial.Rule
	}

	return fmt.Sprintf("%s|%s|%s|%s|%s|%s", guard, denial.Operation, denial.Reason, rule, strings.Join(labels, ","), string(argsJSON))
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
