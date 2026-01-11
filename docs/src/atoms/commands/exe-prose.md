---
id: exe-prose
title: Exe Prose Syntax
brief: LLM-interpreted DSL execution syntax
category: commands
parent: exe
tags: [prose, llm, skills, interpolation, dsl]
related: [exe-simple, exe-blocks, prose]
related-code: [interpreter/eval/exe.ts, interpreter/eval/prose-execution.ts]
updated: 2026-01-10
---

**Prose execution** invokes LLM-interpreted DSL skills (OpenProse or custom):

```mlld
import { @opus } from @mlld/prose

>> Inline (interpolates like templates)
exe @summarize(text) = prose:@opus { summarize @text }

>> File reference (.prose files do NOT interpolate)
exe @review(code) = prose:@opus "./review.prose"

>> Template files (.prose.att or .prose.mtt interpolate)
exe @greet(name) = prose:@opus "./greet.prose.att"
```

Interpolation rules:
- `prose:@config { inline }` - interpolates `@var` like templates
- `"file.prose"` - no interpolation, raw content
- `"file.prose.att"` - ATT interpolation (`@var`)
- `"file.prose.mtt"` - MTT interpolation (`{{var}}`)

See `mlld howto prose` for setup, OpenProse syntax, and custom interpreters.
