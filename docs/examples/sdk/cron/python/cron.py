"""Scheduled digest: summarize recent git activity with mlld."""

import subprocess
import sys
from datetime import date
from pathlib import Path

from mlld import Client


SCRIPT = str(Path(__file__).resolve().parent.parent / "llm" / "digest.mld")
DIGESTS = Path("digests")


def get_recent_commits(since: str = "yesterday") -> str:
    result = subprocess.run(
        ["git", "log", "--oneline", f"--since={since}"],
        capture_output=True, text=True,
    )
    return result.stdout.strip()


def main():
    commits = get_recent_commits()
    if not commits:
        print("No recent commits. Nothing to digest.")
        sys.exit(0)

    today = date.today().isoformat()
    print(f"Generating digest for {today} ({commits.count(chr(10)) + 1} commits)...")

    client = Client()
    try:
        result = client.execute(
            SCRIPT,
            {"commits": commits, "date": today},
            timeout=60,
        )

        digest = None
        for sw in result.state_writes:
            if sw.path == "digest":
                digest = sw.value
                break

        if digest:
            DIGESTS.mkdir(exist_ok=True)
            out = DIGESTS / f"{today}.md"
            out.write_text(digest)
            print(f"Wrote {out}\n")
            print(digest)
        else:
            print("No digest produced.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
