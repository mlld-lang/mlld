---
id: pattern-ralph
title: Ralph Loop Pattern
brief: Autonomous agent loop with dynamic context assembly
category: patterns
parent: patterns
tags: [patterns, agents, loops, orchestration, autonomous]
related: [loop, pattern-gate, pattern-llm-integration, sdk-execute-function]
related-code: [interpreter/eval/loop.ts]
updated: 2026-01-11
---

```mlld
>> ralph.mld - autonomous coding agent loop
>> Run once per iteration, or use loop for continuous execution

import { @claude } from "@lib/claude.mld"

>> Load fresh context each iteration
var @plan = <fix_plan.md>
var @specs = <specs/*.md>

>> Classify the most important task
exe @classifyTask(plan) = [
  let @prompt = `Given this plan, identify the SINGLE most important next task:
@plan
Return JSON: { "task": "...", "type": "implement|fix|test", "files": [...] }`
  => @haiku(@prompt) | @parse.llm
]

>> Build context for the task (load only what's relevant)
exe @buildContext(task, specs) = [
  let @relevant = for @spec in @specs
    when @task.type in @spec.mx.relative => @spec
  let @code = for @file in @task.files => <@file>
  => { specs: @relevant, code: @code }
]

>> Execute the task
exe @executeTask(task, context) = [
  let @prompt = `
# Task
@task.task

# Relevant Specs
@context.specs.join("\n\n")

# Current Code
@context.code.join("\n\n")

Implement this task. Search before assuming not implemented.
After implementing, run tests for just this change.
`
  => @claude(@prompt, "sonnet", ".", "Read,Edit,Write,Bash,Grep,Glob")
]

>> Validate with tests
exe @validate() = [
  let @output = cmd { npm test 2>&1 }
  => { pass: @output.exitCode == 0, output: @output }
]

>> Single iteration
var @task = @classifyTask(@plan)
var @context = @buildContext(@task, @specs)
var @result = @executeTask(@task, @context)
var @check = @validate()

when @check.pass => [
  run cmd { git add -A && git commit -m "@task.task" && git push }
  show "committed"
]
```

The Ralph pattern runs autonomous coding loops with dynamic context assembly. Each iteration:

1. **Load fresh context** - Reload plan and specs from disk
2. **Classify task** - Use a cheap model to pick the most important work
3. **Build context** - Load only relevant specs and code (saves tokens)
4. **Execute** - Run the task with full agent capabilities
5. **Validate** - Run tests as backpressure
6. **Commit on success** - Only persist passing changes

**With continuous loop:**

```mlld
loop(endless) until @state.stop [
  var @plan = <fix_plan.md>
  when @plan.trim() == "" => done "complete"

  let @task = @classifyTask(@plan)
  let @context = @buildContext(@task, <specs/*.md>)
  let @result = @executeTask(@task, @context)
  let @check = @validate()

  when @check.pass => run cmd { git commit -am "@task.task" && git push }
  continue
]
```

**SDK control** - External processes can stop the loop by setting `@state.stop = true`.
