---
id: exe-prose
title: Exe Prose Execution
brief: LLM skill invocation via prose
category: commands
parent: exe
tags: [prose, llm, skills, interpolation]
related: [exe-simple, exe-blocks]
related-code: [interpreter/eval/exe.ts, interpreter/eval/prose.ts]
updated: 2026-01-05
---

**Prose execution** (LLM skill invocation):

Prose requires a config reference specifying the model and skill:

```mlld
var @config = { model: "claude-3", skillName: "prose" }

>> Inline (interpolates like templates)
exe @summarize(text) = prose:@config { summarize @text }

>> File reference (.prose files do NOT interpolate)
exe @review(code) = prose:@config "./review.prose"

>> Template files (.prose.att or .prose.mtt interpolate)
exe @greet(name) = prose:@config "./greet.prose.att"
```

Interpolation rules:
- `prose:@config { inline }` - interpolates `@var` like templates
- `"file.prose"` - no interpolation, raw content
- `"file.prose.att"` - ATT interpolation (`@var`)
- `"file.prose.mtt"` - MTT interpolation (`{{var}}`)

Default skill is `"prose"` (OpenProse). Custom interpreters via `skillName`.
