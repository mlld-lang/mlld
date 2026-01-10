---
id: pattern-data-pipelines
title: Data Pipeline Pattern
brief: Chain transformations with validation
category: patterns
parent: patterns
tags: [patterns, pipelines, validation, transforms]
related: [pipelines-basics, modules-importing-registry]
related-code: []
updated: 2026-01-05
---

```mlld
import { @fetchData, @validate, @transform } from @data/pipeline

var @raw = @fetchData("https://api.example.com/users")
var @valid = @validate(@raw, { schema: "user" })
var @report = @transform(@valid, { format: "report" })
show `Processed @report.count users`
```

**With built-in transforms:**

```mlld
var @data = cmd {curl -s https://api.example.com/data}
var @processed = @data | @json | @validate | @transform | @csv
output @processed to "report.csv"
```
