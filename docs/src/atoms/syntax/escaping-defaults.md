---
id: escaping-defaults
title: Default Values
brief: Provide fallbacks for missing or undefined values
category: syntax
parent: escaping
tags: [escaping, defaults, null-safety]
related: [variables-conditional, escaping-at]
related-code: []
updated: 2026-01-11
---

**Problem:** Need default values when data might be missing.

**Solutions:**

```mlld
>> 1. Ternary expressions
var @name = @user.name ? @user.name : "Anonymous"

>> 2. JavaScript helper for safe access
exe @safe(obj, field, fallback) = js {
  return (obj && obj[field] !== undefined) ? obj[field] : (fallback || null)
}
var @title = @safe(@item, "title", "Untitled")

>> 3. Safe array access
exe @safeArr(obj, field) = js {
  return (obj && Array.isArray(obj[field])) ? obj[field] : []
}
var @tags = @safeArr(@post, "tags")

>> 4. Conditional inclusion with @var?
var @subtitle? = @item.subtitle      >> omit if falsy
show `Title: @item.title @subtitle?` >> subtitle only if present
```

**Common patterns:**

```mlld
>> Optional chaining equivalent
exe @get(obj, path, fallback) = js {
  const keys = path.split('.');
  let val = obj;
  for (const k of keys) {
    if (val == null) return fallback;
    val = val[k];
  }
  return val ?? fallback;
}

var @city = @get(@user, "address.city", "Unknown")
```
