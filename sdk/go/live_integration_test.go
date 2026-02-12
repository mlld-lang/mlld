package mlld

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestLiveExecuteRoundTripWithStateAndDynamicModules(t *testing.T) {
	cliPath, err := filepath.Abs(filepath.Join("..", "..", "dist", "cli.cjs"))
	if err != nil {
		t.Fatalf("resolve cli path: %v", err)
	}
	if _, err := os.Stat(cliPath); err != nil {
		t.Fatalf("dist cli is required: %v", err)
	}

	client := New()
	client.Command = "node"
	client.CommandArgs = []string{cliPath}
	client.Timeout = 15 * time.Second
	defer func() {
		_ = client.Close()
	}()

	processOutput, err := client.Process(
		"/import { @mode } from \"@config\"\n/var @next = @state.count + 1\n/show `mode=@mode count=@next`\n",
		&ProcessOptions{
			State: map[string]any{"count": 1},
			DynamicModules: map[string]any{
				"@config": map[string]any{"mode": "process"},
			},
			Mode:    "markdown",
			Timeout: 10 * time.Second,
		},
	)
	if err != nil {
		t.Fatalf("process failed: %v", err)
	}
	if !strings.Contains(processOutput, "mode=process count=2") {
		t.Fatalf("unexpected process output: %q", processOutput)
	}

	scriptPath := filepath.Join(t.TempDir(), "integration.mld")
	script := "/import { @mode } from \"@config\"\n/import { @text } from \"@payload\"\n\n/var @next = @state.count + 1\n/output @next to \"state://count\"\n/show `text=@text mode=@mode count=@next`\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o644); err != nil {
		t.Fatalf("write test script: %v", err)
	}

	first, err := client.Execute(
		scriptPath,
		map[string]any{"text": "hello"},
		&ExecuteOptions{
			State: map[string]any{"count": 0},
			DynamicModules: map[string]any{
				"@config": map[string]any{"mode": "live"},
			},
			Mode:    "markdown",
			Timeout: 10 * time.Second,
		},
	)
	if err != nil {
		t.Fatalf("first execute failed: %v", err)
	}
	if !strings.Contains(first.Output, "text=hello mode=live count=1") {
		t.Fatalf("unexpected first output: %q", first.Output)
	}

	firstWrite, ok := findStateWrite(first.StateWrites, "count")
	if !ok {
		t.Fatalf("first execute missing count state write: %#v", first.StateWrites)
	}
	firstCount, ok := toFloat(firstWrite.Value)
	if !ok || firstCount != 1 {
		t.Fatalf("unexpected first count value: %#v", firstWrite.Value)
	}

	second, err := client.Execute(
		scriptPath,
		map[string]any{"text": "again"},
		&ExecuteOptions{
			State: map[string]any{"count": firstWrite.Value},
			DynamicModules: map[string]any{
				"@config": map[string]any{"mode": "live"},
			},
			Mode:    "markdown",
			Timeout: 10 * time.Second,
		},
	)
	if err != nil {
		t.Fatalf("second execute failed: %v", err)
	}
	if !strings.Contains(second.Output, "text=again mode=live count=2") {
		t.Fatalf("unexpected second output: %q", second.Output)
	}

	secondWrite, ok := findStateWrite(second.StateWrites, "count")
	if !ok {
		t.Fatalf("second execute missing count state write: %#v", second.StateWrites)
	}
	secondCount, ok := toFloat(secondWrite.Value)
	if !ok || secondCount != 2 {
		t.Fatalf("unexpected second count value: %#v", secondWrite.Value)
	}
}

func TestLiveLoopStopsViaStateUpdate(t *testing.T) {
	cliPath, err := filepath.Abs(filepath.Join("..", "..", "dist", "cli.cjs"))
	if err != nil {
		t.Fatalf("resolve cli path: %v", err)
	}
	if _, err := os.Stat(cliPath); err != nil {
		t.Fatalf("dist cli is required: %v", err)
	}

	client := New()
	client.Command = "node"
	client.CommandArgs = []string{cliPath}
	client.Timeout = 15 * time.Second
	defer func() {
		_ = client.Close()
	}()

	script := strings.Join([]string{
		"loop(99999, 50ms) until @state.exit [",
		"  continue",
		"]",
		"show \"loop-stopped\"",
	}, "\n")

	handle, err := client.ProcessAsync(script, &ProcessOptions{
		State:   map[string]any{"exit": false},
		Mode:    "strict",
		Timeout: 10 * time.Second,
	})
	if err != nil {
		t.Fatalf("start process failed: %v", err)
	}

	time.Sleep(120 * time.Millisecond)
	if err := handle.UpdateState("exit", true); err != nil {
		t.Fatalf("state update failed: %v", err)
	}

	output, err := handle.Result()
	if err != nil {
		t.Fatalf("process wait failed: %v", err)
	}
	if !strings.Contains(output, "loop-stopped") {
		t.Fatalf("unexpected process output: %q", output)
	}
}

func findStateWrite(writes []StateWrite, path string) (StateWrite, bool) {
	for _, write := range writes {
		if write.Path == path {
			return write, true
		}
	}
	return StateWrite{}, false
}

func toFloat(value any) (float64, bool) {
	switch cast := value.(type) {
	case float64:
		return cast, true
	case float32:
		return float64(cast), true
	case int:
		return float64(cast), true
	case int64:
		return float64(cast), true
	case int32:
		return float64(cast), true
	case uint:
		return float64(cast), true
	case uint64:
		return float64(cast), true
	case uint32:
		return float64(cast), true
	case string:
		parsed, err := strconv.ParseFloat(cast, 64)
		if err == nil {
			return parsed, true
		}
		return 0, false
	default:
		return 0, false
	}
}

func TestLiveStateUpdateFailsAfterCompletion(t *testing.T) {
	cliPath, err := filepath.Abs(filepath.Join("..", "..", "dist", "cli.cjs"))
	if err != nil {
		t.Fatalf("resolve cli path: %v", err)
	}
	if _, err := os.Stat(cliPath); err != nil {
		t.Fatalf("dist cli is required: %v", err)
	}

	client := New()
	client.Command = "node"
	client.CommandArgs = []string{cliPath}
	client.Timeout = 15 * time.Second
	defer func() {
		_ = client.Close()
	}()

	handle, err := client.ProcessAsync(
		"show \"done\"",
		&ProcessOptions{
			Mode:    "strict",
			Timeout: 2 * time.Second,
		},
	)
	if err != nil {
		t.Fatalf("start process failed: %v", err)
	}

	output, err := handle.Result()
	if err != nil {
		t.Fatalf("process wait failed: %v", err)
	}
	if !strings.Contains(output, "done") {
		t.Fatalf("unexpected process output: %q", output)
	}

	err = handle.UpdateState("exit", true)
	if err == nil {
		t.Fatal("expected state update to fail after completion")
	}

	requestErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected *Error, got %T (%v)", err, err)
	}
	if requestErr.Code != "REQUEST_NOT_FOUND" {
		t.Fatalf("expected REQUEST_NOT_FOUND, got %q (%v)", requestErr.Code, requestErr)
	}
}
