---
id: foreach
title: Foreach
brief: Transform collections by applying a function to each element
category: control-flow
tags: [iteration, transformation, arrays]
related: [for-arrow, for-collection]
related-code: [interpreter/eval/foreach.ts]
updated: 2026-01-05
---

`foreach` applies a function to each element, returning transformed array.

```mlld
var @names = ["alice", "bob", "charlie"]
exe @greet(name) = `Hi @name!`

var @greetings = foreach @greet(@names)
>> ["Hi alice!", "Hi bob!", "Hi charlie!"]
```

**In exe:**

```mlld
exe @wrapAll(items) = foreach @wrap(@items)
show @wrapAll(["a", "b"])  >> ["[a]", "[b]"]
```

**With options:**

```mlld
show foreach @greet(@names) with { separator: " | " }
>> "Hi alice! | Hi bob! | Hi charlie!"
```
