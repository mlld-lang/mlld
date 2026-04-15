---
id: security-policies
title: Policies
brief: Define and import policy objects
category: config
parent: policy
tags: [security, policies, guards]
related: [security-guards-basics, policy-operations, policy-composition, policy-capabilities, policy-label-flow, policy-auth, policy-authorizations, auth, box-config]
related-code: [interpreter/eval/policy.ts, interpreter/env/environment-provider.ts]
updated: 2026-04-15
qa_tier: 2
---

A policy object combines all security configuration into a single declaration.

```mlld
policy @p = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-sensitive-exfil",
      "no-untrusted-destructive",
      "no-untrusted-privileged",
      >> or with override: { "rule": "no-untrusted-destructive", "taintFacts": true }
      "no-send-to-unknown",
      "no-destroy-unknown",
      "no-unknown-extraction-sources",
      "no-novel-urls"
    ]
  },
  operations: {
    exfil: ["net:w"],
    destructive: ["fs:w"],
    privileged: ["sys:admin"]
  },
  auth: {
    claude: "ANTHROPIC_API_KEY"
  },
  capabilities: {
    allow: ["cmd:git:*"],
    danger: ["@keychain"]
  }
}
```

**`defaults`** sets baseline behavior. `rules` enables built-in security rules that block dangerous label-to-operation flows. `unlabeled` optionally auto-labels all data that has no user-assigned labels -- set to `"untrusted"` to treat unlabeled data as untrusted, or `"trusted"` to treat it as trusted. This is opt-in; without it, unlabeled data has no trust label.

Built-in positive checks use the same `defaults.rules` list. `no-send-to-unknown` checks `exfil:send` operations and requires destination args to carry fact proof or `known`. `no-destroy-unknown` checks `destructive:targeted` operations and requires target args to carry fact proof or `known`. `no-unknown-extraction-sources` checks read-tool source selectors and requires those args to carry fact proof or `known`. On surfaced tool catalogs, those security-relevant args come from input-record `facts`. When the runtime knows the effective control/source args, any `fact:*` proof on those args satisfies the check. Otherwise, it falls back to field-name heuristics (`fact:*.email` for sends, `fact:*.id` for deletes). `no-send-to-external` is the stricter variant requiring `fact:internal:*` or `known:internal`.

`no-untrusted-destructive` and `no-untrusted-privileged` scope their taint checks to effective control args when those are known. Tainted data args (body, title) are not checked — they're expected payload. Without surfaced control-arg metadata, all args are checked. Use the object form `{ "rule": "no-untrusted-destructive", "taintFacts": true }` to force all-arg checking even when effective control args are present.

`no-novel-urls` blocks URL exfiltration: any URL in an `influenced` tool-call argument must appear verbatim in a prior tool result or user payload. URLs the LLM constructs from scratch are blocked. Requires `untrusted-llms-get-influenced` to be active. Use `urls.allowConstruction` in policy to allowlist domains where constructed URLs are acceptable. See `security-url-exfiltration`.

`mlld validate` warns on unknown built-in rule names in `defaults.rules` and suggests the closest known rule when it can.

**`locked`** makes all managed label-flow denials from this policy non-overridable, even by explicit privileged guards. Without `locked: true` (the default), a privileged guard can override policy label-flow denials with `allow` for specific operations. Use `locked: true` for absolute constraints that nothing should bypass.

```mlld
policy @p = {
  defaults: { rules: ["no-secret-exfil"] },
  locked: true
}
```

**`operations`** groups semantic exe labels under risk categories. You label functions with what they DO (`net:w`, `fs:w`), and policy classifies those as risk types (`exfil`, `destructive`). This is the two-step pattern -- see `policy-operations`.

`mlld analyze --format json` surfaces these mappings under `policies[].operations`, and `mlld validate --context ...` can warn when privileged `op:` guards do not match any declared operation labels in the validation context.

**`auth`** defines caller-side credential mappings for `using auth:name`. It accepts short form (`"API_KEY"`) and object form (`{ from, as }`). Policy auth composes with standalone `auth`; caller policy entries override same-name module bindings.

**`capabilities`** controls what operations are allowed at all. `allow` whitelists command patterns. `danger` marks capabilities that require explicit opt-in.

**`env`** defines execution-environment constraints as policy (provider defaults, provider allow/deny rules, tools/mcps/network allowlists). These constraints attenuate runtime box/env configs and cannot be bypassed by local config.

```mlld
policy @p = {
  env: {
    default: "@provider/sandbox",
    providers: {
      "@provider/sandbox": { allowed: true },
      "@provider/raw": { allowed: false }
    },
    tools: { allow: ["Read", "Write"] },
    mcps: { allow: [] },
    net: { allow: ["github.com"] }
  }
}
```

Guards can also return policy fragments through `env` actions. The fragment is merged into active policy for that operation before environment config is derived:

```mlld
guard before op:run = when [
  * => env {
    env: { tools: ["Read", "Write"] },
    policy: { env: { tools: { allow: ["Read"] } } }
  }
]
```

`danger: ["@keychain"]` is required for keychain sources declared in `policy.auth`. Standalone top-level `auth` declarations do not require `danger`.

`needs` declarations are module requirement checks. They do not replace capability policy rules.

**`authorizations`** has two roles. Base policy uses `authorizations.authorizable` to declare which exe roles can authorize which tools. Runtime policy uses `authorizations.allow` / `authorizations.deny` to enforce the compiled per-task envelope. In the current phase this applies only to `tool:w`, and trusted argument metadata comes from the surfaced tool catalog's `inputs: @record` declaration: `facts` define control args, `update` defines mutation fields, and `exact` defines task-grounded payload checks. The planner produces bucketed authorization intent for `@policy.build`; the framework checks `authorizable`, compiles the intent, and applies the returned policy to the worker call. Invalid authorization intent fails closed during activation.

Pinned planner values can also carry attestation requirements. If a planner pins a `known` recipient, the matching authorization can satisfy inherited positive checks. Pinning the same raw literal without that attestation is not enough to bypass rules such as `no-send-to-unknown`.

```mlld
var @taskPolicy = {
  authorizations: {
    allow: {
      send_email: { args: { recipients: ["mark@example.com"] } },
      create_file: true
    }
  }
}

var @result = @worker(@prompt) with { policy: @taskPolicy }
```

Developer-declared base policy permissions live alongside runtime deny rules:

```mlld
policy @workspace = {
  authorizations: {
    deny: ["update_password"],
    authorizable: {
      role:planner: [@send_email, @create_file]
    }
  }
}
```

See `policy-authorizations` for full syntax including control-arg enforcement and validation.

**Export/import:** Share policies across scripts:

```mlld
export { @p }

>> In another file
import policy @p from "./policies.mld"
```

Policies compose with `union()` -- combine multiple config objects into one policy. The most restrictive rules win.
