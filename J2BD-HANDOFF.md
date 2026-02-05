# J2BD Security Jobs: Alignment with Spec v5

**Date**: 2026-02-05
**Status**: Jobs updated to align with spec design decisions

## Summary

8 parallel agent analyses revealed significant misalignments between security job specifications and the actual design in spec-security-2026-v5.md. Jobs have been updated to match spec reality and clarify design intentions.

## Critical Changes Made

### 1. prevent-exfil.md - MAJOR REWRITE
**Issue**: Expected automatic network call detection
**Reality**: Manual operation labeling required (by design)

**Changes**:
- Added "Design Note" explaining no automatic classification
- Added two-step pattern: semantic labels (`exe net:w`) + policy classification (`operations: { "net:w": exfil }`)
- Updated example to show `policy.operations` configuration
- Added "Why This Design" section explaining intentional manual labeling
- Made clear: developers must label operations, automatic inference would be false security

### 2. wrap-mcp-tools.md - COMPLETE REWRITE
**Issue**: Used non-existent syntax (`import tools from mcp`, `op:mcp` label)
**Reality**: MCP via environment modules with `@mcpConfig()` functions

**Changes**:
- Removed `import tools from mcp` syntax (doesn't exist)
- Changed from `op:mcp` label to `src:mcp` source label
- Added environment module pattern with `@mcpConfig()` function
- Added profile-based MCP configuration (full/readonly)
- Updated guards to filter on `src:mcp` not `op:mcp`
- Added "Key Differences" section explaining actual implementation

### 3. defaults-rules-demo.md - SIGNIFICANT UPDATES
**Issue**: Showed direct `exe exfil` labeling, missing policy classification
**Reality**: Two-step pattern required

**Changes**:
- Added explanation of semantic vs risk labels
- Updated example to show `policy.operations` configuration
- Demonstrated both approaches: semantic labels + classification AND direct classification
- Added "Understanding the Two-Step Pattern" section
- Made clear: `exfil`/`destructive`/`privileged` are risk classifications, not direct labels

### 4. sandbox-agent.md - ADDED DESIGN CONSTRAINTS
**Issue**: Unclear what's enforced where (mlld vs provider vs agent)
**Clarified**: Multiple enforcement layers

**Changes**:
- Added "Design Constraints" section explaining enforcement layers
- Clarified: tool restrictions may be configuration hints, not mlld-enforced
- Clarified: command capabilities (`deny: ["sh"]`) ARE mlld-enforced via policy
- Clarified: filesystem/network enforced by provider (Docker), not mlld
- Clarified: credentials are structural guarantee, not runtime check
- Updated Phase 4 adversarial tests to specify enforcement layer for each test

### 5. audit-guard-pattern.md - ADDED ENFORCEMENT REQUIREMENT
**Issue**: Implied `autoverify: true` enforces verification automatically
**Reality**: Requires explicit guard to enforce

**Changes**:
- Added **enforcement guard requirement** to Phase 2 success criteria
- Added `guard @ensureVerified after llm` to example code
- Added `untrusted-llms-get-influenced` rule to policy (required for influenced label)
- Made clear: autoverify injects instructions, guard enforces they're followed
- Updated Phase 3 to verify enforcement guard works

## Jobs Not Modified (Already Aligned)

- **audit-ledger-taint.md** - Minor ambiguities but core design matches spec
- **policy-composition.md** - Needs `union()` documentation but functionally correct
- **package-env.md** - Legacy pattern note needed but otherwise aligned

## Key Design Principles Reinforced

1. **No automatic classification** - Developers explicitly label operations (semantic) and policy classifies them (risk). This is intentional, not a missing feature.

2. **Two-step pattern** - Semantic labels (`net:w`, `fs:w`) are portable; risk classifications (`exfil`, `destructive`) are project-specific. Policy bridges them.

3. **Layered enforcement** - mlld enforces policy, providers enforce isolation, structural guarantees eliminate certain attack vectors.

4. **Manual > Magic** - Automatic inference creates false security. Explicit labeling makes security visible and auditable.

## Next Steps for J2BD System

**Recommendation**: Add job validation phase before execution:
1. Load spec and job simultaneously
2. Check for contradictions (expected syntax doesn't exist, automatic behavior spec says is manual)
3. Escalate contradictions as "blocked" before implementation starts
4. This prevents implementing spec-compliant code that doesn't match job expectations

## Files Modified

- j2bd/security/jobs/prevent-exfil.md
- j2bd/security/jobs/wrap-mcp-tools.md
- j2bd/security/jobs/defaults-rules-demo.md
- j2bd/security/jobs/sandbox-agent.md
- j2bd/security/jobs/audit-guard-pattern.md

All jobs now clearly state design constraints and match spec-security-2026-v5.md.
