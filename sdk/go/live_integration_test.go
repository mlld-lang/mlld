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

func TestNextEventStateWriteRoundTrip(t *testing.T) {
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
		"output \"ping\" to \"state://pending\"",
		"loop(600, 50ms) until @state.result [",
		"  continue",
		"]",
		"show @state.result",
	}, "\n")

	handle, err := client.ProcessAsync(script, &ProcessOptions{
		State:   map[string]any{"pending": nil, "result": nil},
		Timeout: 10 * time.Second,
	})
	if err != nil {
		t.Fatalf("start process failed: %v", err)
	}

	event, err := handle.NextEvent(5 * time.Second)
	if err != nil {
		t.Fatalf("next event failed: %v", err)
	}
	if event == nil || event.Type != "state_write" || event.StateWrite == nil {
		t.Fatalf("expected state_write event, got %#v", event)
	}
	if event.StateWrite.Path != "pending" || event.StateWrite.Value != "ping" {
		t.Fatalf("unexpected state_write event: %#v", event.StateWrite)
	}

	if err := handle.UpdateState("result", "pong"); err != nil {
		t.Fatalf("state update failed: %v", err)
	}

	event, err = handle.NextEvent(5 * time.Second)
	if err != nil {
		t.Fatalf("next completion event failed: %v", err)
	}
	if event == nil || event.Type != "complete" {
		t.Fatalf("expected complete event, got %#v", event)
	}

	event, err = handle.NextEvent(100 * time.Millisecond)
	if err != nil {
		t.Fatalf("unexpected post-complete next_event error: %v", err)
	}
	if event != nil {
		t.Fatalf("expected nil after completion, got %#v", event)
	}

	output, err := handle.Result()
	if err != nil {
		t.Fatalf("process wait failed: %v", err)
	}
	if !strings.Contains(output, "pong") {
		t.Fatalf("unexpected process output: %q", output)
	}
}

func TestNextEventReturnsGuardDenialBeforeCompletion(t *testing.T) {
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

	handle, err := client.ProcessAsync(strings.Join([]string{
		"/guard @blocker before op:exe = when [",
		"  @mx.op.name == \"send\" => deny \"recipient not authorized\"",
		"  * => allow",
		"]",
		"/exe @send(value) = when [",
		"  denied => \"blocked\"",
		"  * => @value",
		"]",
		"/show @send(\"hello\")",
	}, "\n"), &ProcessOptions{
		Mode:    "markdown",
		Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("start guarded process failed: %v", err)
	}

	event, err := handle.NextEvent(5 * time.Second)
	if err != nil {
		t.Fatalf("next event failed: %v", err)
	}
	if event == nil || event.Type != "guard_denial" || event.GuardDenial == nil {
		t.Fatalf("expected guard_denial event, got %#v", event)
	}
	if event.GuardDenial.Operation != "send" || event.GuardDenial.Reason != "recipient not authorized" {
		t.Fatalf("unexpected guard_denial event: %#v", event.GuardDenial)
	}
	if event.GuardDenial.Args["value"] != "hello" {
		t.Fatalf("unexpected guard denial args: %#v", event.GuardDenial.Args)
	}

	event, err = handle.NextEvent(5 * time.Second)
	if err != nil {
		t.Fatalf("next completion event failed: %v", err)
	}
	if event == nil || event.Type != "complete" {
		t.Fatalf("expected complete event, got %#v", event)
	}

	output, err := handle.Result()
	if err != nil {
		t.Fatalf("process wait failed: %v", err)
	}
	if !strings.Contains(output, "blocked") {
		t.Fatalf("unexpected guarded output: %q", output)
	}
}

func TestExecuteHandleWriteFileCreatesSignedOutputWithProvenance(t *testing.T) {
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

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	routesDir := filepath.Join(root, "routes")
	if err := os.MkdirAll(routesDir, 0o755); err != nil {
		t.Fatalf("create routes dir: %v", err)
	}

	scriptPath := filepath.Join(routesDir, "route.mld")
	script := strings.Join([]string{
		"loop(99999, 50ms) until @state.exit [",
		"  continue",
		"]",
		"show \"done\"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o644); err != nil {
		t.Fatalf("write route script: %v", err)
	}

	handle, err := client.ExecuteAsync(scriptPath, nil, &ExecuteOptions{
		State:   map[string]any{"exit": false},
		Timeout: 10 * time.Second,
	})
	if err != nil {
		t.Fatalf("start execute failed: %v", err)
	}

	writeResult, err := handle.WriteFile("out.txt", "hello from sdk", 5*time.Second)
	if err != nil {
		t.Fatalf("write_file failed: %v", err)
	}

	expectedPath := filepath.Join(routesDir, "out.txt")
	if writeResult.Path != expectedPath {
		t.Fatalf("expected path %q, got %q", expectedPath, writeResult.Path)
	}
	if writeResult.Status != "verified" || !writeResult.Verified {
		t.Fatalf("expected verified write result, got %#v", writeResult)
	}
	if writeResult.Signer == nil || *writeResult.Signer != "agent:route" {
		t.Fatalf("expected signer agent:route, got %#v", writeResult.Signer)
	}
	if contents, err := os.ReadFile(expectedPath); err != nil {
		t.Fatalf("read written file: %v", err)
	} else if string(contents) != "hello from sdk" {
		t.Fatalf("unexpected file contents %q", string(contents))
	}

	if writeResult.Metadata == nil {
		t.Fatalf("expected write metadata to be present")
	}
	taint, ok := writeResult.Metadata["taint"].([]any)
	if !ok || len(taint) != 1 || taint[0] != "untrusted" {
		t.Fatalf("expected untrusted taint metadata, got %#v", writeResult.Metadata["taint"])
	}
	provenance, ok := writeResult.Metadata["provenance"].(map[string]any)
	if !ok {
		t.Fatalf("expected provenance metadata, got %#v", writeResult.Metadata["provenance"])
	}
	if provenance["sourceType"] != "mlld_execution" {
		t.Fatalf("unexpected provenance sourceType: %#v", provenance["sourceType"])
	}
	if provenance["sourceId"] != strconv.FormatUint(handle.RequestID(), 10) {
		t.Fatalf("unexpected provenance sourceId: %#v", provenance["sourceId"])
	}
	if provenance["scriptPath"] != scriptPath {
		t.Fatalf("unexpected provenance scriptPath: %#v", provenance["scriptPath"])
	}

	if err := handle.UpdateState("exit", true); err != nil {
		t.Fatalf("state update failed: %v", err)
	}

	final, err := handle.Result()
	if err != nil {
		t.Fatalf("execute wait failed: %v", err)
	}
	if !strings.Contains(final.Output, "done") {
		t.Fatalf("unexpected execute output: %q", final.Output)
	}

	_, err = handle.WriteFile("late.txt", "too late")
	if err == nil {
		t.Fatal("expected write_file to fail after completion")
	}

	requestErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected *Error, got %T (%v)", err, err)
	}
	if requestErr.Code != "REQUEST_COMPLETE" {
		t.Fatalf("expected REQUEST_COMPLETE, got %q (%v)", requestErr.Code, requestErr)
	}
}

func TestSignVerifySignContentAndFSStatusRoundTrip(t *testing.T) {
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

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	docsDir := filepath.Join(root, "docs")
	if err := os.MkdirAll(docsDir, 0o755); err != nil {
		t.Fatalf("create docs dir: %v", err)
	}
	notePath := filepath.Join(docsDir, "note.txt")
	if err := os.WriteFile(notePath, []byte("hello from go sdk"), 0o644); err != nil {
		t.Fatalf("write note: %v", err)
	}

	signed, err := client.Sign("docs/note.txt", &SignOptions{
		Identity: "user:alice",
		Metadata: map[string]any{"purpose": "sdk"},
		BasePath: root,
		Timeout:  10 * time.Second,
	})
	if err != nil {
		t.Fatalf("sign failed: %v", err)
	}

	verified, err := client.Verify("docs/note.txt", &VerifyOptions{
		BasePath: root,
		Timeout:  10 * time.Second,
	})
	if err != nil {
		t.Fatalf("verify failed: %v", err)
	}

	contentSignature, err := client.SignContent("signed body", "user:alice", &SignContentOptions{
		Metadata:    map[string]string{"channel": "sdk"},
		SignatureID: "content-1",
		BasePath:    root,
		Timeout:     10 * time.Second,
	})
	if err != nil {
		t.Fatalf("sign_content failed: %v", err)
	}

	statuses, err := client.FSStatus("docs/*.txt", &FSStatusOptions{
		BasePath: root,
		Timeout:  10 * time.Second,
	})
	if err != nil {
		t.Fatalf("fs_status failed: %v", err)
	}

	if signed.Status != "verified" || !signed.Verified {
		t.Fatalf("unexpected sign result: %#v", signed)
	}
	if signed.Signer == nil || *signed.Signer != "user:alice" {
		t.Fatalf("unexpected sign signer: %#v", signed.Signer)
	}
	if signed.Metadata == nil || signed.Metadata["purpose"] != "sdk" {
		t.Fatalf("unexpected sign metadata: %#v", signed.Metadata)
	}

	if verified.Status != "verified" || !verified.Verified {
		t.Fatalf("unexpected verify result: %#v", verified)
	}
	if verified.Signer == nil || *verified.Signer != "user:alice" {
		t.Fatalf("unexpected verify signer: %#v", verified.Signer)
	}
	if verified.Metadata == nil || verified.Metadata["purpose"] != "sdk" {
		t.Fatalf("unexpected verify metadata: %#v", verified.Metadata)
	}

	if contentSignature.ID != "content-1" || contentSignature.SignedBy != "user:alice" {
		t.Fatalf("unexpected sign_content result: %#v", contentSignature)
	}
	if contentSignature.Metadata["channel"] != "sdk" {
		t.Fatalf("unexpected sign_content metadata: %#v", contentSignature.Metadata)
	}
	if _, err := os.Stat(filepath.Join(root, ".sig", "content", "content-1.sig.json")); err != nil {
		t.Fatalf("missing persisted content signature json: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".sig", "content", "content-1.sig.content")); err != nil {
		t.Fatalf("missing persisted content signature body: %v", err)
	}

	if len(statuses) != 1 {
		t.Fatalf("expected one fs status entry, got %d", len(statuses))
	}
	if statuses[0].RelativePath != "docs/note.txt" || statuses[0].Status != "verified" {
		t.Fatalf("unexpected fs status entry: %#v", statuses[0])
	}
	if statuses[0].Signer == nil || *statuses[0].Signer != "user:alice" {
		t.Fatalf("unexpected fs status signer: %#v", statuses[0].Signer)
	}
}

func TestSDKLabelsFlowThroughPayloadAndStateUpdates(t *testing.T) {
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
		"show @payload.history.mx.labels.includes(\"untrusted\")",
		"show @state.tool_result.mx.labels.includes(\"untrusted\")",
		"show @state.tool_result",
	}, "\n")

	handle, err := client.ProcessAsync(script, &ProcessOptions{
		Payload: map[string]any{
			"history": "tool transcript",
		},
		PayloadLabels: map[string][]string{
			"history": []string{"untrusted"},
		},
		State: map[string]any{
			"exit":        false,
			"tool_result": nil,
		},
		Mode:    "strict",
		Timeout: 10 * time.Second,
	})
	if err != nil {
		t.Fatalf("start labeled process failed: %v", err)
	}

	time.Sleep(120 * time.Millisecond)
	if err := handle.UpdateState("tool_result", "tool output", "untrusted"); err != nil {
		t.Fatalf("labeled state update failed: %v", err)
	}
	if err := handle.UpdateState("exit", true); err != nil {
		t.Fatalf("exit state update failed: %v", err)
	}

	output, err := handle.Result()
	if err != nil {
		t.Fatalf("labeled process wait failed: %v", err)
	}

	rawLines := strings.Split(strings.TrimSpace(output), "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		lines = append(lines, trimmed)
	}
	if len(lines) != 3 {
		t.Fatalf("unexpected labeled output: %q", output)
	}
	if lines[0] != "true" || lines[1] != "true" || lines[2] != "tool output" {
		t.Fatalf("unexpected labeled output fields: %q", output)
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
	if requestErr.Code != "REQUEST_COMPLETE" {
		t.Fatalf("expected REQUEST_COMPLETE, got %q (%v)", requestErr.Code, requestErr)
	}
}
