// File-watching agent that classifies incoming documents with mlld.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	mlld "github.com/mlld-lang/mlld/sdk/go"
)

func main() {
	scriptPath, _ := filepath.Abs(filepath.Join("..", "llm", "process.mld"))

	os.MkdirAll("inbox", 0o755)
	os.MkdirAll("done", 0o755)

	client := mlld.New()
	defer client.Close()

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
		os.Exit(1)
	}
	defer watcher.Close()

	if err := watcher.Add("inbox"); err != nil {
		fmt.Fprintf(os.Stderr, "watch error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Watching inbox/ for new .md files. Drop a file in to classify it.")
	fmt.Println("Press Ctrl+C to stop.")
	fmt.Println()

	for {
		select {
		case event := <-watcher.Events:
			if event.Op&fsnotify.Create == 0 {
				continue
			}
			if filepath.Ext(event.Name) != ".md" {
				continue
			}

			// Brief delay to let file writes finish
			time.Sleep(200 * time.Millisecond)
			processFile(client, scriptPath, event.Name)

		case err := <-watcher.Errors:
			fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
		}
	}
}

func processFile(client *mlld.Client, scriptPath, filePath string) {
	name := filepath.Base(filePath)
	fmt.Printf("Processing %s...\n", name)

	content, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Printf("  Error reading: %v\n", err)
		return
	}

	result, err := client.Execute(
		scriptPath,
		map[string]any{"content": string(content), "filename": name},
		&mlld.ExecuteOptions{Timeout: 60 * time.Second},
	)
	if err != nil {
		fmt.Printf("  Error: %v\n", err)
		return
	}

	for _, sw := range result.StateWrites {
		if sw.Path == "result" {
			out, _ := json.MarshalIndent(sw.Value, "", "  ")
			fmt.Printf("  -> %s\n", out)

			stem := name[:len(name)-len(filepath.Ext(name))]
			os.WriteFile(filepath.Join("done", stem+".result.json"), out, 0o644)
			break
		}
	}

	os.Rename(filePath, filepath.Join("done", name))
}
