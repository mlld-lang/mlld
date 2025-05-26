---
layout: docs.njk
title: "Syntax Highlighting Test"
---

# Syntax Highlighting Test

This page tests the new Prism.js syntax highlighting for Mlld.

## Basic Example

```mlld
>> This is a comment
@text greeting = "Hello, World!"
@data config = {
  name: "Test",
  count: 42,
  enabled: true
}

@add [[Welcome {{greeting}}!]]
```

## All Directives

```mlld
@text message = "Test"
@data settings = { debug: true }
@run [echo "Hello"]
@add [README.md]
@path docs = [./docs]
@import {config} from [settings.mld]
@exec greet(name) = @run [echo "Hi @name"]
@exec template = [[Custom {{message}}]]
@add [docs/guide.md # Section]
@url api = [https://api.example.com]
```

## Complex Example

```mlld
@text projectName = "MlldProject"
@data buildInfo = {
  version: "1.0.0",
  status: @run [echo "SUCCESS"],
  timestamp: @run [date +%s]
}

@exec build(env) = @run [
  npm run build -- --env=@env
]

@add [[
## Build Report for {{projectName}}
Version: {{buildInfo.version}}
Status: {{buildInfo.status}}
Time: {{buildInfo.timestamp}}
]]

@run @build("production")
```