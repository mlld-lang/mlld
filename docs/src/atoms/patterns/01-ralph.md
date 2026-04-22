---
id: pattern-ralph
qa_tier: 3
title: Ralph Loop Pattern
brief: Autonomous agent loop with fresh context and test backpressure
category: patterns
tags: [patterns, agents, loops, orchestration, autonomous]
related: [loop, pattern-gate, pattern-llm-integration, config-sdk-execute, checkpoint-resume, hooks]
related-code: [interpreter/eval/loop.ts]
updated: 2026-02-24
---

Autonomous coding loop based on the [Ralph Wiggum technique](https://ghuntley.com/ralph/) by Geoff Huntley. Each iteration: reload context from disk, pick one task, execute it, test, commit on green. The loop is the outer process; the LLM decides what to work on.

```mlld
>> ralph.mld - autonomous coding agent loop

import { @claudePoll } from @mlld/claude

var @tools = ["Read", "Write", "Edit", "Glob", "Grep", "Bash(git:*)", "Bash(npm:*)"]

>> Cheap model picks the most important task from current plan
exe llm @pickTask(plan, specs) = [
  let @prompt = `Given this plan and these specs, identify the SINGLE most
important next task. Search before assuming something isn't implemented.
Return JSON: { "task": "...", "type": "implement|fix|test", "files": [...] }

<plan>
@plan
</plan>

<specs>
@specs
</specs>

IMPORTANT: Write your JSON response to @mx.outPath using the Write tool.`
  @claudePoll(@prompt, {
    model: "haiku",
    tools: ["Read", "Glob", "Grep", "Write"],
    poll: @mx.outPath
  })
  => <@mx.outPath>? | @parse.llm
]

>> Worker executes the task with full agent capabilities
exe llm @doTask(task, specs) = [
  let @prompt = `# Task
@task.task

# Specs
@specs

Implement this task. Search the codebase before assuming anything is
not implemented. After implementing, run tests for just this change.

IMPORTANT: Write your result JSON to @mx.outPath using the Write tool.`
  @claudePoll(@prompt, {
    model: "sonnet",
    tools: @tools,
    poll: @mx.outPath
  })
  => <@mx.outPath>?
]

>> Validate with tests
exe @test() = [
  let @out = sh { npm test 2>&1 }
  => { pass: @out.exitCode == 0, output: @out }
]

>> The loop
loop(endless) [
  >> Fresh context every iteration — the context IS the history
  let @plan = <fix_plan.md>
  when @plan.trim() == "" => done "complete"
  let @specs = <specs/*.md>

  >> One task per loop — trust the LLM to pick what matters
  let @task = @pickTask(@plan, @specs)
  let @result = @doTask(@task, @specs)

  >> Test backpressure — only commit what passes
  let @check = @test()
  when @check.pass => run sh { git commit -am "@task.task" && git push }

  continue
]
```

**Core principles:**

- **One task per loop** — Each iteration picks a single task and executes it. Narrowing scope keeps context usage low and outcomes predictable.
- **Fresh context from disk** — Plan and specs reload every iteration. No chat history carried forward. The filesystem is the state.
- **Test backpressure** — Tests gate commits. Failing iterations aren't fatal; the next iteration sees the current state and adapts.
- **LLM picks the work** — The cheap classifier decides priority. The orchestrator doesn't encode task selection logic.

**Crash recovery** — The `llm` label on `@pickTask` and `@doTask` enables automatic caching. If the loop crashes mid-iteration, re-running the script replays completed LLM calls from cache.

```bash
mlld run ralph                     # auto-resumes via cache
mlld run ralph --resume @doTask    # re-run all worker calls
mlld run ralph --new               # fresh run, clear cache
```

**Hook telemetry:**

```mlld
hook @progress after op:loop = [
  log `iteration @mx.loop.iteration`
]
```

**With pacing** — Add a delay between iterations to avoid hammering APIs:

```mlld
loop(endless, 5s) [
  ...
]
```

**With a cap** — Limit total iterations:

```mlld
loop(50) [
  ...
]
```
