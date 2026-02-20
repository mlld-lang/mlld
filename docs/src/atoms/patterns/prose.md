---
id: prose
title: Prose Execution
brief: Execute LLM-interpreted DSL skills (OpenProse and custom)
category: patterns
parent: patterns
tags: [patterns, llm, prose, openprose, skills, agents, dsl]
related: [exe-prose, pattern-llm-integration, exe-blocks]
related-code: [interpreter/eval/prose-execution.ts]
updated: 2026-01-10
---

The `prose {}` syntax executes LLM-interpreted DSL skills. By default it uses **OpenProse**, but any custom interpreter can be configured.

## What is Prose Execution?

Prose execution invokes skills that an LLM interprets at runtime. Unlike `run js {}` which executes deterministically, `prose {}` sends content to an LLM with specific skills enabled. This enables complex multi-agent workflows defined in a domain-specific language.

## Setup

1. Install the OpenProse plugin in Claude Code:
   ```
   /plugin marketplace add git@github.com:openprose/prose.git
   /plugin install open-prose@prose
   ```

2. Restart Claude Code and boot OpenProse:
   ```
   /prose-boot
   ```

3. Skills will prompt for approval on first use.

## Basic Usage

```mlld
import { @opus } from @mlld/prose

exe @research(topic) = prose:@opus {
  session "Research @topic"
  agent researcher { model: sonnet, skills: [web-search] }
  researcher: find current information about @topic
  output findings
}

run @research("quantum computing trends")
```

## Key Concepts

**session** - Names the workflow for context

**agent** - Defines an agent with model and skills

**loop until** - Iterates with semantic exit conditions:
```mlld
exe @refine(draft) = prose:@opus {
  session "Refine document"
  loop until **the draft meets publication standards** {
    critique @draft
    revise based on critique
  }
}
```

**parallel** - Run tasks concurrently:
```mlld
exe @gather(topics) = prose:@opus {
  session "Research multiple topics"
  parallel for each topic in @topics {
    research topic
  }
  combine results
}
```

## Template Files

For complex workflows, use external files:

```mlld
exe @workflow(ctx) = prose:@opus "./workflow.prose"
exe @workflow(ctx) = prose:@opus "./workflow.prose.att"  >> ATT interpolation
```

## Custom Interpreters

Use any LLM-interpreted DSL by configuring different skills:

```mlld
import { @claude } from @mlld/claude

>> Create a custom model executor
exe @myModel(prompt) = @claude(@prompt, "opus", @root)

>> Configure with custom skills
var @myDSL = {
  model: @myModel,
  skills: ["my-custom:boot", "my-custom:run"]
}

exe @process(data) = prose:@myDSL {
  >> Your custom DSL syntax here
  analyze @data
  output result
}
```

The skill determines how the LLM interprets the prose content. OpenProse is one implementation - you can create your own DSL skills or use other prose interpreters.

## OpenProse Requirements

For OpenProse specifically:
- **Claude Code** with Opus (only model that reliably interprets OpenProse syntax)
- **OpenProse skills** approved: `open-prose:prose-boot`, `open-prose:prose-compile`, `open-prose:prose-run`

See `mlld howto exe-prose` for syntax details. OpenProse docs: https://prose.md
