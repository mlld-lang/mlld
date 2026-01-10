# Alternative Syntax and Escape Hatches

This document covers alternative syntax forms for special cases. For most use cases, use the primary syntax described in the main documentation.

## When to Use Alternatives

The primary template syntax (`@var` interpolation, `::...::` templates, `.att` files) works for most cases. Use alternatives only when:

- Your content has many `@` symbols that would require escaping (e.g., Discord mentions, social media handles)
- You're working with existing mustache-style templates

## Triple-Colon Templates (`:::...:::`)

Use triple-colon syntax when your content has many `@` symbols that would conflict with variable interpolation:

```mlld
>> Discord mentions with user IDs
var @alert = :::Alert <@{{adminId}}>! Reported by <@{{userId}}>:::

>> Social media handles
var @tweet = :::Hey @{{handle}}, check this! cc: @{{team1}} @{{team2}}:::
```

### Key Differences from Primary Syntax

| Feature | Primary (`::@var::`) | Triple-colon (`:::{{var}}:::`) |
|---------|---------------------|-------------------------------|
| Variable interpolation | `@var` | `{{var}}` |
| File loading | `<file.md>` | Not supported |
| Function calls | `@exe()` | Not supported |
| Pipes | Supported | Not supported |
| Loops | Supported | Not supported |

### When NOT to Use Triple-Colon

```mlld
>> Don't use ::: for normal templates
var @msg = :::Status: {{status}}:::  >> Loses all features
var @msg = ::Status: @status::       >> Use primary syntax
```

## MTT Template Files (`.mtt`)

For external templates with mustache-style interpolation:

**templates/discord-alert.mtt:**
```
Alert <@{{adminId}}>!
Reporter: <@{{reporterId}}>
Severity: {{severity}}
```

**Usage:**
```mlld
exe @alert(adminId, reporterId, severity) = template "./templates/discord-alert.mtt"
show @alert("123", "456", "high")
```

### Key Differences from ATT Files

| Feature | `.att` (primary) | `.mtt` (alternative) |
|---------|-----------------|---------------------|
| Variable interpolation | `@var` | `{{var}}` |
| File loading | `<file.md>` | Not supported |
| Function calls | `@exe()` | Not supported |
| Pipes | Supported | Not supported |
| Loops (`for`/`end`) | Supported | Not supported |

## Common Migration Patterns

### Discord Bot

If you're building a Discord bot with many user mentions:

```mlld
>> Use .mtt for Discord message templates
exe @mentionUser(userId, message) = template "./discord/mention.mtt"

>> mention.mtt contents:
>> <@{{userId}}> {{message}}
```

### Social Media Formatter

For content with many @handles:

```mlld
exe @formatTweet(handle, content, mentions) = template "./social/tweet.mtt"

>> tweet.mtt contents:
>> @{{handle}}: {{content}}
>> cc: {{mentions}}
```

## Best Practices

1. **Default to primary syntax** - Use `::@var::` and `.att` unless you have a specific reason
2. **Document your choice** - If using alternatives, add a comment explaining why
3. **Don't mix** - Pick one style per template file
4. **Consider escaping** - For occasional `@` symbols, escaping (`\@`) may be simpler than switching syntax
