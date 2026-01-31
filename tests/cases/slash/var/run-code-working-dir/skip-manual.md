This test requires the real filesystem since it tests working directory override with `pwd` which reports the actual filesystem path. The VFS in the test harness doesn't support this scenario.

Manually verified with:
```bash
echo 'var @cwd = run sh:/tmp { pwd }
show @cwd' | npx mlld /dev/stdin
```

Expected output: `/private/tmp` (on macOS) or `/tmp` (on Linux)
