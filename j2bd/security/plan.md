# Security Documentation Plan

## Status: In Progress

## Priority Order

Security features have natural dependencies:
1. **Labels** (foundation) - everything else builds on this
2. **Policy** (uses labels) - declarative security rules
3. **Guards** (uses labels + policy) - dynamic enforcement
4. **Environments** (uses all above) - execution contexts
5. **MCP** (uses environments) - tool wrapping
6. **Signing** (standalone) - cryptographic integrity
7. **Audit** (uses all) - forensics

## Current Focus

### Labels (Priority 1)
- [ ] labels-overview - what labels are, why they matter
- [ ] labels-source-auto - src:mcp, src:exec, src:file, etc.
- [ ] labels-sensitivity - secret, pii, sensitive
- [ ] labels-trust - trusted/untrusted mechanics
- [ ] labels-propagation - how labels flow through transforms
- [ ] labels-mx-context - @mx.labels, @mx.taint, @mx.sources

### Policy (Priority 2)
- [ ] policy-overview - structure, how to define
- [ ] policy-defaults - unlabeled, rules, autosign, autoverify
- [ ] policy-capabilities - allow/deny/danger patterns
- [ ] policy-label-flow - deny/allow rules, most-specific-wins
- [ ] policy-auth - sealed credential paths
- [ ] policy-standard - @mlld/production, development, sandbox

### Guards (Priority 3)
- [x] guards-basics - existing atom, needs review
- [ ] guards-privileged - with { privileged: true }
- [ ] guards-label-modification - => trusted!, => !label, => clear!
- [ ] guards-env-action - => env @config

### Environments (Priority 4)
- [ ] env-overview - what environments are
- [ ] env-config - configuration as values
- [ ] env-blocks - env @config [...] syntax
- [ ] env-child-derivation - new @parent with { ... }
- [ ] env-providers - docker, sprites

### MCP (Priority 5)
- [ ] mcp-security - src:mcp auto-tainting
- [ ] mcp-policy - label rules for MCP data
- [ ] mcp-config - @mcpConfig() function

### Signing (Priority 6)
- [ ] signing-overview - why sign templates
- [ ] sign-verify - sign/verify primitives
- [ ] autosign-autoverify - policy defaults

### Audit (Priority 7)
- [ ] audit-overview - location, purpose
- [ ] audit-events - what gets logged

## Completed

(Items move here when done)

## Blocked

(Items that need impl work before docs)

## Learnings

(Capture discoveries here for agent.md)
