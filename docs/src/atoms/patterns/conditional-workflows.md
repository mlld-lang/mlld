---
id: pattern-conditional-workflows
title: Conditional Workflow Pattern
brief: Route execution based on conditions
category: patterns
parent: patterns
tags: [patterns, conditionals, workflows, routing]
related: [when, if]
related-code: []
updated: 2026-01-31
---

```mlld
import { @getPR, @commentOnPR } from @company/github

var @pr = @getPR(@MLLD_PR_NUMBER)
var @status = when [
  @pr.mergeable => "ready"
  * => "blocked"
]

when [
  @status == "ready" => @commentOnPR(@MLLD_PR_NUMBER, "Ready to merge")
  @status == "blocked" => show "Needs attention"
]
```
