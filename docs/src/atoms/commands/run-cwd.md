---
id: run-cwd
title: Run Command Working Directory
brief: Override working directory for command execution
category: commands
parent: run
tags: [execution, commands, cwd, directory]
related: [run-basics]
related-code: [interpreter/eval/run.ts, interpreter/env/WorkingDirectory.ts]
updated: 2026-01-05
---

**Working directory override:**

```mlld
run cmd:/ {pwd}                    >> runs in /
run sh:/tmp {pwd}                  >> runs in /tmp
run js:/tmp {console.log(process.cwd())}
```
