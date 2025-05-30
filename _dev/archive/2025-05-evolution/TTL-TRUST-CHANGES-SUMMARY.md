# Summary of TTL & Trust Integration Changes

## Overview
Updated all security, registry, and cache documentation to integrate the new TTL (Time-To-Live) and Trust syntax features. The key innovation is separating security and performance precedence rules.

## Core Design Decisions

### 1. TTL Syntax
- **Human-readable**: `(30m)`, `(1h)`, `(7d)`, `(2w)`
- **Milliseconds**: `(5000)` - bare numbers default to ms
- **Keywords**: `(live)` = always fresh, `(static)` = cache forever
- **Legacy**: `(ttl=3600000)` still supported

### 2. Trust Levels
- `trust always` - No approval needed (if not blocked by policy)
- `trust verify` - Always prompt for approval
- `trust never` - Block execution/access

### 3. Precedence Rules (KEY INSIGHT)
- **Security (trust)**: Global > Project > Inline (restrictive wins)
- **Performance (TTL)**: Inline > Project > Global (specific wins)
- This prevents security bypasses while allowing performance tuning

## Document Changes

### SECURITY.md
- Replaced separate config files with `mlld.lock.json` hierarchy
- Added split precedence rules for security vs performance
- Updated global policy to include `defaultTTL` patterns
- Added examples showing global blocks cannot be bypassed
- Enhanced configuration examples with TTL/trust in lock files

### REGISTRY-PHASE1-DNS.md
- Updated cache structure to content-addressed storage (SHA256)
- Modified lock file format to include TTL and trust metadata
- Enhanced import resolution to check TTL (live/static/time-based)
- Updated CLI commands: `mlld install @user/module --ttl 7d --trust verify`
- Added TTL-aware cache behavior examples

### REGISTRY-PHASE2-SERVICE.md
- Updated syntax from `mlld://` to `@user/module` format
- Added inline TTL/trust examples in .mld files
- Enhanced API responses to include `recommendedTTL`
- Updated module pages to show TTL/trust configuration

### HASH-CACHE.md
- Enhanced lock file examples with full TTL/trust integration
- Updated CLI commands to support all TTL options
- Added trust level examples for install/update commands
- Updated resolution algorithm to include TTL and trust validation
- Added security integration with trust level handling

### BASIC-SECURITY.md
- Updated to use `mlld.lock.json` instead of separate config
- Added TTL and trust fields to module metadata

### SECURITY-REGISTRY-INTEGRATION.md
- Updated import syntax to new `@user/module` format
- Enhanced lock file security properties
- Updated command analyzer to use trust levels for risk assessment
- Modernized CLI commands to align with new syntax

### TTL-TRUST.md (New)
- Comprehensive implementation plan
- Grammar updates with TTL option parsing
- Type system updates for metadata
- Security manager implementation with proper precedence
- User experience implications and error messages

## Key Benefits

1. **Security Cannot Be Bypassed**: Global blocks are absolute
2. **Performance Can Be Tuned**: Developers control caching
3. **Clear Mental Model**: "Security flows down, performance bubbles up"
4. **Unified System**: Everything in `mlld.lock.json` files
5. **Future-Proof**: Sets foundation for MCP security standard

## Example Usage

```meld
# In .mld files
@path api (5m) = [https://api.example.com] trust always
@path secure (1h) = [https://bank.com/api] trust verify
@run [dangerous-cmd] trust never

# CLI commands
mlld install @user/module --ttl 7d --trust verify
mlld update --force  # Ignore TTL
mlld ls  # Shows TTL and trust info
```

## Next Steps

1. Implement grammar changes for TTL/trust parsing
2. Update type definitions with new metadata
3. Integrate security manager with precedence rules
4. Update CLI commands to support new flags
5. Create comprehensive test suite
6. Document user-facing features