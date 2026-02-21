---
id: policy-auth
title: Policy Auth
brief: Sealed credential injection via using auth:*
category: security
parent: security
tags: [credentials, auth, policy, secrets, keychain]
related: [security-policies, env-config, labels-sensitivity]
related-code: [interpreter/utils/auth-injection.ts, interpreter/policy/PolicyEnforcer.ts]
updated: 2026-02-05
---

The `policy.auth` section defines credential mappings. The `using auth:*` syntax injects them as environment variables.

**Why sealed paths matter:** Credentials injected via `using auth:*` bypass string interpolation entirely — they flow directly to environment variables at the OS level, never entering the command template string. This prevents prompt injection from extracting secrets by manipulating the command construction. An attacker who controls `@userInput` cannot trick the LLM into leaking `$API_KEY` because the secret never appears in the interpolatable string.

```mlld
policy @p = {
  auth: {
    claude: { from: "keychain:mlld-env-myproject/claude", as: "ANTHROPIC_API_KEY" },
    github: { from: "env:GH_TOKEN", as: "GH_TOKEN" }
  }
}

run cmd { claude -p "hello" } using auth:claude
```

**Auth config fields:**

| Field | Purpose |
|-------|---------|
| `from` | Source: `"keychain:path"` or `"env:VAR"` |
| `as` | Target environment variable name |

**Keychain policy:**

Keychain paths use `service/account` and support `{projectname}` from `mlld-config.json`. `policy.keychain.allow` and `policy.keychain.deny` use glob patterns on that `service/account` path. Keychain access requires `danger: ["@keychain"]`.

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

run cmd { claude -p "hello" } using auth:claude
```

**Label flow checks for `using auth:*`:**

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

**Explicit variable injection:**

```mlld
var secret @token = "computed-value"
run cmd { tool } using @token as TOOL_KEY
```

Direct keychain access is blocked; use `policy.auth` with `using auth:*` instead.

**Note:** The `no-secret-exfil` rule blocks secrets flowing through `exfil`-labeled operations. To also block direct `show`/`log` of secrets, add label flow rules:

```mlld
policy @p = {
  labels: { secret: { deny: ["op:show", "op:log"] } }
}
```
