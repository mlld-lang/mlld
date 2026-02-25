---
id: auth
title: Auth
brief: Standalone credential declarations for using auth:*
category: config
tags: [auth, keychain, credentials, secrets, security]
related: [policy-auth, security-policies, policy-capabilities]
related-code: [interpreter/utils/auth-injection.ts, core/policy/union.ts, interpreter/policy/keychain-policy.ts, cli/commands/keychain.ts]
updated: 2026-02-22
qa_tier: 2
---

Use `auth` to declare credentials at module scope without requiring callers to import policy objects.

## Standalone auth

```mlld
auth @brave = "BRAVE_API_KEY"

exe @search(q) = js { /* uses process.env.BRAVE_API_KEY */ } using auth:brave
```

Short form expands to:
- `from: "keychain:mlld-env-{projectname}/BRAVE_API_KEY"`
- `as: "BRAVE_API_KEY"`
- runtime resolution: keychain first, then `process.env.BRAVE_API_KEY`

## Long forms

```mlld
auth @brave = { from: "keychain", as: "BRAVE_API_KEY" }
auth @brave = { from: "keychain:custom-service/custom-account", as: "BRAVE_API_KEY" }
auth @brave = { from: "env:SOME_OTHER_VAR", as: "BRAVE_API_KEY" }
```

`from: "keychain"` expands to `keychain:mlld-env-{projectname}/<as>`.

Unknown provider schemes (for example `op://...`) fail with a clear error until provider support is added.

## Policy composition

`policy.auth` still works and accepts the same short/long forms:

```mlld
policy @p = {
  auth: {
    brave: "BRAVE_API_KEY",
    claude: { from: "keychain", as: "ANTHROPIC_API_KEY" }
  }
}
```

Resolution order for `using auth:name`:
1. Auth captured on the executable where it was defined
2. Caller `policy.auth`
3. Caller standalone `auth`

Caller definitions override same-name module auth.

## Keychain CLI

```bash
mlld keychain add BRAVE_API_KEY
mlld keychain get BRAVE_API_KEY
mlld keychain list
mlld keychain rm BRAVE_API_KEY
mlld keychain import .env
```

Entries are stored as `service=mlld-env-{projectname}` / `account=<name>`.
