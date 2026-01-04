// Package mlld provides a Go wrapper around the mlld CLI.
//
// Example:
//
//	client := mlld.New()
//	output, err := client.Process(`/var @name = "World"
//	Hello, @name!`)
//	// output: "Hello, World!"
package mlld

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"
)

// Client wraps the mlld CLI.
type Client struct {
	// Command to invoke mlld. Defaults to "mlld".
	Command string

	// Default timeout for operations. Zero means no timeout.
	Timeout time.Duration

	// Working directory for script execution.
	WorkingDir string
}

// New creates a Client with default settings.
func New() *Client {
	return &Client{
		Command: "mlld",
		Timeout: 30 * time.Second,
	}
}

// ProcessOptions configures a Process call.
type ProcessOptions struct {
	// FilePath provides context for relative imports.
	FilePath string

	// Timeout overrides the client default.
	Timeout time.Duration
}

// Process executes an mlld script string and returns the output.
func (c *Client) Process(script string, opts *ProcessOptions) (string, error) {
	if opts == nil {
		opts = &ProcessOptions{}
	}

	args := []string{"/dev/stdin"}

	timeout := opts.Timeout
	if timeout == 0 {
		timeout = c.Timeout
	}

	ctx := context.Background()
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, c.Command, args...)
	cmd.Stdin = bytes.NewReader([]byte(script))
	if c.WorkingDir != "" {
		cmd.Dir = c.WorkingDir
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", &Error{
			Message: stderr.String(),
			Err:     err,
		}
	}

	return stdout.String(), nil
}

// ExecuteOptions configures an Execute call.
type ExecuteOptions struct {
	// State is injected as @state in the script.
	State map[string]any

	// DynamicModules are injected as importable modules.
	DynamicModules map[string]any

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

// Execute runs an mlld file with a payload and optional state.
func (c *Client) Execute(filepath string, payload any, opts *ExecuteOptions) (*ExecuteResult, error) {
	if opts == nil {
		opts = &ExecuteOptions{}
	}

	args := []string{filepath, "--structured"}

	if payload != nil {
		payloadJSON, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("marshal payload: %w", err)
		}
		args = append(args, "--inject", fmt.Sprintf("@payload=%s", payloadJSON))
	}

	if opts.State != nil {
		stateJSON, err := json.Marshal(opts.State)
		if err != nil {
			return nil, fmt.Errorf("marshal state: %w", err)
		}
		args = append(args, "--inject", fmt.Sprintf("@state=%s", stateJSON))
	}

	if opts.DynamicModules != nil {
		for key, value := range opts.DynamicModules {
			moduleJSON, err := json.Marshal(value)
			if err != nil {
				return nil, fmt.Errorf("marshal dynamic module %s: %w", key, err)
			}
			args = append(args, "--inject", fmt.Sprintf("%s=%s", key, moduleJSON))
		}
	}

	timeout := opts.Timeout
	if timeout == 0 {
		timeout = c.Timeout
	}

	ctx := context.Background()
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, c.Command, args...)
	if c.WorkingDir != "" {
		cmd.Dir = c.WorkingDir
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, &Error{
			Message: stderr.String(),
			Err:     err,
		}
	}

	var result ExecuteResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		// If JSON parsing fails, treat output as plain text
		result.Output = stdout.String()
	}

	return &result, nil
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

// Analyze performs static analysis on an mlld module without executing it.
func (c *Client) Analyze(filepath string) (*AnalyzeResult, error) {
	args := []string{"analyze", filepath, "--format", "json"}

	cmd := exec.Command(c.Command, args...)
	if c.WorkingDir != "" {
		cmd.Dir = c.WorkingDir
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, &Error{
			Message: stderr.String(),
			Err:     err,
		}
	}

	var result AnalyzeResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return nil, fmt.Errorf("parse analysis result: %w", err)
	}

	return &result, nil
}

// Error wraps mlld execution errors.
type Error struct {
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return e.Err.Error()
}

func (e *Error) Unwrap() error {
	return e.Err
}
