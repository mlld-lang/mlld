---
id: policy-auth
title: Policy Auth
brief: Credential mappings and sealed auth injection via using auth:*
category: security
parent: security
tags: [credentials, auth, policy, secrets, keychain]
related: [auth, security-policies, env-config, labels-sensitivity]
related-code: [interpreter/utils/auth-injection.ts, interpreter/policy/PolicyEnforcer.ts]
updated: 2026-02-22
---

`using auth:*` injects credentials as environment variables using sealed paths.

Why sealed paths matter: injected credentials bypass string interpolation. They are set at process env level and do not pass through prompt-controlled template text.

```mlld
auth @brave = "BRAVE_API_KEY"

policy @p = {
  auth: {
    claude: { from: "keychain", as: "ANTHROPIC_API_KEY" },
    github: { from: "env:GH_TOKEN", as: "GH_TOKEN" },
    brave: "BRAVE_API_KEY"
  }
}

run cmd { claude -p "hello" } using auth:claude with { policy: @p }
```

Standalone `auth` and `policy.auth` use the same mapping shape. Use `policy.auth` when callers need to remap module auth names.

## Config forms

| Field | Purpose |
|-------|---------|
| `from` | Source: `"keychain:path"`, `"keychain"`, or `"env:VAR"` |
| `as` | Target environment variable name |

Short form examples:

```mlld
auth @brave = "BRAVE_API_KEY"

policy @p = {
  auth: {
    brave: "BRAVE_API_KEY",
    claude: { from: "keychain", as: "ANTHROPIC_API_KEY" }
  }
}
```

Expansion rules:
- `"BRAVE_API_KEY"` -> `{ from: "keychain:mlld-env-{projectname}/BRAVE_API_KEY", as: "BRAVE_API_KEY" }`
- `{ from: "keychain", as: "ANTHROPIC_API_KEY" }` -> `{ from: "keychain:mlld-env-{projectname}/ANTHROPIC_API_KEY", as: "ANTHROPIC_API_KEY" }`

## Resolution order

For `using auth:name`, mlld resolves in this order:
1. Auth captured on the executable where it was defined
2. Caller `policy.auth`
3. Caller standalone `auth`

Caller bindings override same-name captured bindings.

## Keychain behavior

Keychain paths use `service/account` and support `{projectname}` from `mlld-config.json`.

Resolution for `from: "keychain:..."`:
1. Read keychain entry
2. If missing, read `process.env[as]`
3. If both missing, throw

Unsupported provider schemes (for example `op://...`) fail with an explicit error.

`policy.keychain.allow` and `policy.keychain.deny` still gate keychain access.

`danger: ["@keychain"]` is required for `policy.auth` keychain sources. Standalone `auth` declares keychain intent directly and does not require `danger`.

Linux keychain access uses `secret-tool` (libsecret). Ensure `secret-tool` is on PATH.

```mlld
policy @p = {
  auth: {
    claude: { from: "keychain:mlld-env-{projectname}/claude", as: "ANTHROPIC_API_KEY" }
  },
  keychain: {
    allow: ["mlld-env-{projectname}/*"],
    deny: ["system/*"]
  },
  capabilities: { danger: ["@keychain"] }
}

run cmd { claude -p "hello" } using auth:claude with { policy: @p }
```

## Label flow checks for using auth:*

Auth injection keeps secrets out of command strings, but policy label flow checks still apply to env injection. Secrets injected via `using auth:*` are treated as `secret` input for policy checks, and `using @var as ENV` uses the variable's labels.

```mlld
policy @p = {
  auth: { api: { from: "env:SECRET", as: "API_KEY" } },
  labels: { secret: { deny: ["exfil"] } }
}

>> BLOCKED: secret flows to exfil-labeled operation
exe exfil @send() = run cmd { curl -H "Auth: $API_KEY" ... } using auth:api
show @send()
```

## Explicit variable injection

```mlld
var secret @token = "computed-value"
run cmd { tool } using @token as TOOL_KEY
```

Direct keychain access in templates/commands is blocked; use `auth` or `policy.auth` with `using auth:*` instead.

Note: `no-secret-exfil` blocks secrets flowing through `exfil`-labeled operations. To also block direct `show` or `log` of secrets, add label flow rules:

```mlld
policy @p = {
  labels: { secret: { deny: ["op:show", "op:log"] } }
}
```
