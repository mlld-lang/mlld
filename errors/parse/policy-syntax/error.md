Policy syntax error

The `policy` directive has two valid forms:

**Inline object** (for single policy):
```mlld
policy @${POLICY_NAME} = {
  defaults: { unlabeled: "untrusted" },
  deny: ["cmd"]
}
```

**union()** (for merging multiple policies):
```mlld
var @base = { defaults: { unlabeled: "untrusted" } }
var @strict = { deny: ["cmd"] }
policy @${POLICY_NAME} = union(@base, @strict)
```

`union()` merges policies: allows are intersected (more restrictive), denies are unioned (more restrictive). Use it when combining policies from different sources.

**Common issues:**
- Missing `@` prefix on policy name
- Object content has syntax errors (check brackets, commas, quotes)
- Using a variable reference directly (use `union(@ref)` to wrap it)

Your line: `${LINE}`
