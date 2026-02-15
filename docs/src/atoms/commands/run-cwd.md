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
qa_tier: 2
---

**Working directory override:**

```mlld
run cmd:/ {pwd}                    >> runs in /
var @myPath = "/tmp"
run cmd:@myPath {pwd}              >> runs in /tmp
run cmd:~ {pwd}                    >> runs in home directory
run sh:/tmp {pwd}                  >> runs in /tmp
run js:/tmp {console.log(process.cwd())}
```

`run` cwd supports absolute paths, `@var` references, and `~` home expansion.
