// Scheduled digest: summarize recent git activity with mlld.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	mlld "github.com/mlld-lang/mlld/sdk/go"
)

func main() {
	scriptPath, _ := filepath.Abs(filepath.Join("..", "llm", "digest.mld"))

	commits := getRecentCommits("yesterday")
	if commits == "" {
		fmt.Println("No recent commits. Nothing to digest.")
		os.Exit(0)
	}

	today := time.Now().Format("2006-01-02")
	lines := strings.Count(commits, "\n") + 1
	fmt.Printf("Generating digest for %s (%d commits)...\n", today, lines)

	client := mlld.New()
	defer client.Close()

	result, err := client.Execute(
		scriptPath,
		map[string]any{"commits": commits, "date": today},
		&mlld.ExecuteOptions{Timeout: 60 * time.Second},
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	for _, sw := range result.StateWrites {
		if sw.Path == "digest" {
			digest, _ := sw.Value.(string)

			os.MkdirAll("digests", 0o755)
			outPath := filepath.Join("digests", today+".md")
			os.WriteFile(outPath, []byte(digest), 0o644)
			fmt.Printf("Wrote %s\n\n", outPath)
			fmt.Println(digest)
			return
		}
	}

	fmt.Println("No digest produced.")
}

func getRecentCommits(since string) string {
	cmd := exec.Command("git", "log", "--oneline", "--since="+since)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
