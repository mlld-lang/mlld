# Cron Example: Daily Digest

A scheduled script that gathers recent git activity and generates a readable summary using an LLM.

## How it works

1. Host app runs `git log --oneline --since=yesterday`
2. If no commits, exits early (no LLM call wasted)
3. Calls `mlld execute` with the commit log as payload
4. mlld script (`llm/digest.mld`) sends commits to haiku for summarization
5. Host app reads the digest from `state_writes` and writes `digests/YYYY-MM-DD.md`

## Setup

```bash
cd docs/examples/sdk/cron
mlld install @mlld/claude
```

## Run manually

```bash
# Python (requires: pip install mlld-sdk)
python python/cron.py

# Go
cd go && go run cron.go

# Rust
cd rust && cargo run

# Ruby (requires: gem install mlld)
ruby ruby/cron.rb

# Elixir
elixir elixir/cron.exs
```

## Run on a schedule

### crontab (Linux/macOS)

```bash
# Run daily at 9am
crontab -e
0 9 * * * cd /path/to/cron && python python/cron.py >> /var/log/mlld-digest.log 2>&1
```

### systemd timer (Linux)

```ini
# /etc/systemd/system/mlld-digest.timer
[Timer]
OnCalendar=*-*-* 09:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### launchd (macOS)

```xml
<!-- ~/Library/LaunchAgents/com.mlld.digest.plist -->
<plist version="1.0">
<dict>
  <key>Label</key><string>com.mlld.digest</string>
  <key>ProgramArguments</key>
  <array>
    <string>python3</string>
    <string>/path/to/cron/python/cron.py</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>WorkingDirectory</key><string>/path/to/cron</string>
</dict>
</plist>
```

## Adapting this pattern

The git log is one context source. In production, gather whatever's relevant:

- **GitHub API**: Open PRs, recent issues, CI status
- **Monitoring**: Error rates, latency percentiles, alert history
- **Project management**: Sprint progress, blocked tickets
- **Multiple repos**: Aggregate commits across a team's repositories

Pass all gathered context as payload fields. The mlld script synthesizes it.
