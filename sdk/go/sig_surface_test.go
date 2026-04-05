package mlld

import (
	"reflect"
	"testing"
	"time"
)

func TestBuildFSStatusRequest(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}

	method, params, timeout := client.buildFSStatusRequest("docs/*.txt", &FSStatusOptions{
		BasePath: "/repo",
		Timeout:  5 * time.Second,
	})

	if method != "fs:status" {
		t.Fatalf("expected fs:status method, got %q", method)
	}
	if timeout != 5*time.Second {
		t.Fatalf("expected timeout 5s, got %v", timeout)
	}

	expected := map[string]any{
		"glob":     "docs/*.txt",
		"basePath": "/repo",
	}
	if !reflect.DeepEqual(params, expected) {
		t.Fatalf("unexpected fs_status params: %#v", params)
	}
}

func TestBuildSignRequest(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}

	method, params, timeout := client.buildSignRequest("docs/a.txt", &SignOptions{
		Identity: "user:alice",
		Metadata: map[string]any{"purpose": "sdk"},
		BasePath: "/repo",
		Timeout:  6 * time.Second,
	})

	if method != "sig:sign" {
		t.Fatalf("expected sig:sign method, got %q", method)
	}
	if timeout != 6*time.Second {
		t.Fatalf("expected timeout 6s, got %v", timeout)
	}

	expected := map[string]any{
		"path":     "docs/a.txt",
		"identity": "user:alice",
		"metadata": map[string]any{"purpose": "sdk"},
		"basePath": "/repo",
	}
	if !reflect.DeepEqual(params, expected) {
		t.Fatalf("unexpected sign params: %#v", params)
	}
}

func TestBuildVerifyRequestUsesClientDefaultTimeout(t *testing.T) {
	client := &Client{Timeout: 12 * time.Second}

	method, params, timeout := client.buildVerifyRequest("docs/a.txt", &VerifyOptions{
		BasePath: "/repo",
	})

	if method != "sig:verify" {
		t.Fatalf("expected sig:verify method, got %q", method)
	}
	if timeout != 12*time.Second {
		t.Fatalf("expected default timeout 12s, got %v", timeout)
	}

	expected := map[string]any{
		"path":     "docs/a.txt",
		"basePath": "/repo",
	}
	if !reflect.DeepEqual(params, expected) {
		t.Fatalf("unexpected verify params: %#v", params)
	}
}

func TestBuildSignContentRequest(t *testing.T) {
	client := &Client{Timeout: 30 * time.Second}

	method, params, timeout := client.buildSignContentRequest("hello world", "user:alice", &SignContentOptions{
		Metadata:    map[string]string{"channel": "sdk"},
		SignatureID: "content-1",
		BasePath:    "/repo",
		Timeout:     7 * time.Second,
	})

	if method != "sig:sign-content" {
		t.Fatalf("expected sig:sign-content method, got %q", method)
	}
	if timeout != 7*time.Second {
		t.Fatalf("expected timeout 7s, got %v", timeout)
	}

	expected := map[string]any{
		"content":  "hello world",
		"identity": "user:alice",
		"metadata": map[string]string{"channel": "sdk"},
		"id":       "content-1",
		"basePath": "/repo",
	}
	if !reflect.DeepEqual(params, expected) {
		t.Fatalf("unexpected sign_content params: %#v", params)
	}
}
