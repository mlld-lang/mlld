package mlld

import (
	"reflect"
	"testing"
	"time"
)

func TestBuildProcessRequestMergesLabeledPayloadAndMcpServers(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}
	allowAbsolutePaths := true

	params, timeout, err := client.buildProcessRequest("show @payload.history", &ProcessOptions{
		FilePath: "/repo/agent.mld",
		Payload: map[string]any{
			"history": Untrusted("tool transcript"),
			"query":   Trusted("hello"),
			"plain":   "keep me",
		},
		PayloadLabels: map[string][]string{
			"query": []string{"extra", "trusted"},
		},
		DynamicModuleSource: "sdk",
		McpServers:          map[string]string{"tools": "uv run python3 mcp_server.py"},
		AllowAbsolutePaths:  &allowAbsolutePaths,
		Trace:               "effects",
		TraceMemory:         true,
		TraceFile:           "trace.jsonl",
		TraceStderr:         true,
		Timeout:             5 * time.Second,
	})
	if err != nil {
		t.Fatalf("buildProcessRequest failed: %v", err)
	}

	if timeout != 5*time.Second {
		t.Fatalf("expected timeout 5s, got %v", timeout)
	}

	expectedPayload := map[string]any{
		"history": "tool transcript",
		"query":   "hello",
		"plain":   "keep me",
	}
	if !reflect.DeepEqual(params["payload"], expectedPayload) {
		t.Fatalf("unexpected payload: %#v", params["payload"])
	}

	expectedLabels := map[string][]string{
		"history": []string{"untrusted"},
		"query":   []string{"trusted", "extra"},
	}
	if !reflect.DeepEqual(params["payloadLabels"], expectedLabels) {
		t.Fatalf("unexpected payloadLabels: %#v", params["payloadLabels"])
	}

	expectedMcpServers := map[string]string{"tools": "uv run python3 mcp_server.py"}
	if !reflect.DeepEqual(params["mcpServers"], expectedMcpServers) {
		t.Fatalf("unexpected mcpServers: %#v", params["mcpServers"])
	}
	if params["recordEffects"] != true {
		t.Fatalf("expected recordEffects=true, got %#v", params["recordEffects"])
	}
	if params["trace"] != "effects" || params["traceMemory"] != true || params["traceFile"] != "trace.jsonl" || params["traceStderr"] != true {
		t.Fatalf("unexpected trace params: %#v", params)
	}
}

func TestRuntimeStartupArgs(t *testing.T) {
	wrapperArgs, err := runtimeStartupArgs("mlld", nil, "8g", 2)
	if err != nil {
		t.Fatalf("runtimeStartupArgs wrapper failed: %v", err)
	}
	if !reflect.DeepEqual(wrapperArgs, []string{"--mlld-heap=8g", "--heap-snapshot-near-limit", "2"}) {
		t.Fatalf("unexpected wrapper args: %#v", wrapperArgs)
	}

	nodeArgs, err := runtimeStartupArgs("node", []string{"./dist/cli.cjs"}, "8g", 2)
	if err != nil {
		t.Fatalf("runtimeStartupArgs node failed: %v", err)
	}
	expectedNode := []string{"--max-old-space-size=8192", "--heapsnapshot-near-heap-limit=2", "./dist/cli.cjs"}
	if !reflect.DeepEqual(nodeArgs, expectedNode) {
		t.Fatalf("unexpected node args: %#v", nodeArgs)
	}

	if _, err := runtimeStartupArgs("node", nil, "nope", 0); err == nil {
		t.Fatalf("expected invalid heap to fail")
	}
	if _, err := runtimeStartupArgs("mlld", nil, "", -1); err == nil {
		t.Fatalf("expected invalid heap snapshot limit to fail")
	}
}

func TestBuildExecuteRequestSerializesTraceMemory(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}

	params, _, err := client.buildExecuteRequest("/repo/agent.mld", map[string]any{"name": "Ada"}, &ExecuteOptions{
		TraceMemory: true,
		TraceFile:   "trace.jsonl",
	})
	if err != nil {
		t.Fatalf("buildExecuteRequest failed: %v", err)
	}

	if params["traceMemory"] != true || params["traceFile"] != "trace.jsonl" {
		t.Fatalf("unexpected trace params: %#v", params)
	}
}

func TestBuildExecuteRequestRejectsUnknownPayloadLabelField(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}

	_, _, err := client.buildExecuteRequest("/repo/agent.mld", map[string]any{
		"text": "hello",
	}, &ExecuteOptions{
		PayloadLabels: map[string][]string{
			"missing": []string{"untrusted"},
		},
	})
	if err == nil {
		t.Fatalf("expected error for unknown payload_labels field")
	}

	requestErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected *Error, got %T", err)
	}
	if requestErr.Code != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %q", requestErr.Code)
	}
}

func TestBuildExecuteRequestRejectsPayloadLabelsWithoutMapPayload(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}

	_, _, err := client.buildExecuteRequest("/repo/agent.mld", "hello", &ExecuteOptions{
		PayloadLabels: map[string][]string{
			"text": []string{"trusted"},
		},
	})
	if err == nil {
		t.Fatalf("expected error for payload_labels with non-map payload")
	}
}

func TestDefaultClientSingletonAndClose(t *testing.T) {
	defer func() {
		_ = CloseDefaultClient()
	}()

	first := DefaultClient()
	second := DefaultClient()
	if first != second {
		t.Fatalf("expected DefaultClient to reuse the same instance")
	}

	if err := CloseDefaultClient(); err != nil {
		t.Fatalf("CloseDefaultClient failed: %v", err)
	}

	third := DefaultClient()
	if third == first {
		t.Fatalf("expected DefaultClient to create a new instance after close")
	}
}
