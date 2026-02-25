---
id: comments
title: Comments
brief: Line and end-of-line comments
category: syntax
parent: syntax
tags: [comments, documentation]
related: []
related-code: [grammar/patterns/comment.peggy]
updated: 2026-01-05
qa_tier: 1
---

Use `>>` at start of line or `<<` at end.

```mlld
>> This is a comment
var @x = 5    << end-of-line comment
show @x       >> also works here
```
