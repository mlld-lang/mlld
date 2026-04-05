package mlld

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func loadFixtureEnvelope(t *testing.T, name string) map[string]any {
	t.Helper()

	path := filepath.Join("..", "fixtures", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}

	var envelope map[string]any
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("decode fixture %s: %v", name, err)
	}

	return envelope
}

func TestExecuteResultFixturePreservesSecurity(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "execute-result.json")

	result, err := decodeExecuteResult(envelope["result"], nil, nil)
	if err != nil {
		t.Fatalf("decode execute result fixture: %v", err)
	}

	if len(result.StateWrites) != 1 {
		t.Fatalf("expected one state write, got %d", len(result.StateWrites))
	}
	if labels := result.StateWrites[0].Security["labels"]; labels == nil {
		t.Fatalf("expected state write security labels to be preserved")
	}
	if len(result.Effects) != 1 || result.Effects[0].Security == nil {
		t.Fatalf("expected effect security to be preserved: %#v", result.Effects)
	}
}

func TestAnalyzeResultFixtureUsesTrigger(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "analyze-result.json")

	payload, ok := asMap(envelope["result"])
	if !ok {
		t.Fatalf("expected analyze result payload to be an object")
	}

	serialized, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal analyze payload: %v", err)
	}

	var result AnalyzeResult
	if err := json.Unmarshal(serialized, &result); err != nil {
		t.Fatalf("decode analyze fixture: %v", err)
	}

	if len(result.Guards) != 2 {
		t.Fatalf("expected two guards, got %d", len(result.Guards))
	}
	if result.Guards[0].Trigger != "secret" {
		t.Fatalf("expected first guard trigger=secret, got %q", result.Guards[0].Trigger)
	}
	if result.Guards[1].Name != "" || result.Guards[1].Trigger != "net:w" {
		t.Fatalf("unexpected unnamed guard decode: %#v", result.Guards[1])
	}
}

func TestStateWriteEventFixturePreservesSecurity(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "state-write-event.json")

	event, ok := asMap(envelope["event"])
	if !ok {
		t.Fatalf("expected state-write event payload to be an object")
	}

	stateWrite, ok := parseStateWriteEvent(event)
	if !ok {
		t.Fatalf("expected state-write fixture to decode")
	}

	if stateWrite.Path != "payload" {
		t.Fatalf("expected path=payload, got %q", stateWrite.Path)
	}
	if stateWrite.Security == nil || stateWrite.Security["labels"] == nil {
		t.Fatalf("expected security metadata to be preserved: %#v", stateWrite.Security)
	}
}

func TestErrorFixtureDecodesTransportError(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "error-result.json")

	errorPayload, ok := asMap(envelope["error"])
	if !ok {
		t.Fatalf("expected error payload to be an object")
	}

	var requestErr *Error
	if err := errorFromFixture(errorPayload); err == nil {
		t.Fatalf("expected fixture error to decode")
	} else if !asRequestError(err, &requestErr) {
		t.Fatalf("expected *Error, got %T", err)
	} else if requestErr.Code != "TIMEOUT" {
		t.Fatalf("expected TIMEOUT code, got %q", requestErr.Code)
	}
}

func TestSignResultFixtureDecodesFileVerifyResult(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "sign-result.json")

	result, err := decodeFileVerifyResult(envelope["result"])
	if err != nil {
		t.Fatalf("decode sign fixture: %v", err)
	}

	if result.RelativePath != "docs/a.txt" {
		t.Fatalf("expected relative path docs/a.txt, got %q", result.RelativePath)
	}
	if result.ExpectedHash == nil || *result.ExpectedHash != "sha256:abc" {
		t.Fatalf("expected expectedHash to be preserved, got %#v", result.ExpectedHash)
	}
	if result.Metadata == nil || result.Metadata["purpose"] != "sdk" {
		t.Fatalf("expected metadata to be preserved, got %#v", result.Metadata)
	}
}

func TestFsStatusFixtureDecodesFilesystemStatuses(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "fs-status-result.json")

	serialized, err := json.Marshal(envelope["result"])
	if err != nil {
		t.Fatalf("marshal fs-status fixture: %v", err)
	}

	var statuses []FilesystemStatus
	if err := json.Unmarshal(serialized, &statuses); err != nil {
		t.Fatalf("decode fs-status fixture: %v", err)
	}

	if len(statuses) != 1 {
		t.Fatalf("expected one fs-status entry, got %d", len(statuses))
	}
	if statuses[0].RelativePath != "docs/a.txt" {
		t.Fatalf("expected relative path docs/a.txt, got %q", statuses[0].RelativePath)
	}
	if len(statuses[0].Labels) != 1 || statuses[0].Labels[0] != "trusted" {
		t.Fatalf("expected labels to be preserved, got %#v", statuses[0].Labels)
	}
}

func TestSignContentFixtureDecodesContentSignature(t *testing.T) {
	envelope := loadFixtureEnvelope(t, "sign-content-result.json")

	serialized, err := json.Marshal(envelope["result"])
	if err != nil {
		t.Fatalf("marshal sign-content fixture: %v", err)
	}

	var signature ContentSignature
	if err := json.Unmarshal(serialized, &signature); err != nil {
		t.Fatalf("decode sign-content fixture: %v", err)
	}

	if signature.SignedBy != "user:alice" {
		t.Fatalf("expected signedBy=user:alice, got %q", signature.SignedBy)
	}
	if signature.Metadata["channel"] != "sdk" {
		t.Fatalf("expected metadata channel=sdk, got %#v", signature.Metadata)
	}
}

func errorFromFixture(payload map[string]any) error {
	client := New()
	return client.errorFromPayload(payload)
}

func asRequestError(err error, target **Error) bool {
	if typed, ok := err.(*Error); ok {
		*target = typed
		return true
	}
	return false
}
