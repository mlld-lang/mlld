# Security Documentation Status

## Still Relevant/Useful Documents

### 1. Core Reference Documents
These should be kept and referenced during implementation:

- **lockfile-design-discussion.md** - The definitive lock file schema and design rationale
- **SECURITY-PRINCIPLES.md** - Core security philosophy (timeless)
- **custom-resolver-requirements.md** - Resolver spec needed for implementation
- **ttl-trust-syntax.md** - TTL/trust syntax specification

### 2. Active Implementation Guides
These workstreams contain detailed implementation plans:

- **01-grammar-ttl-trust.md** - Step-by-step grammar implementation
- **02-security-integration.md** - How to wire up SecurityManager
- **03-hash-cache-imports.md** - Module caching implementation details
- **05-cli-commands.md** - CLI command specifications

### 3. Historical Context (Archive)
These are partially outdated but contain useful context:

- **TTL-TRUST.md** - Original TTL/trust implementation plan
- **REGISTRY-PHASE1-DNS.md** - DNS registry design (ABANDONED - using GitHub instead)
- **SECURITY.md** - Early security model (some concepts superseded)

## Key Implementation Details Not in SECURITY-VISION.md

1. **Registry Structure** (from docs/dev/REGISTRY.md):
   - GitHub repo with per-user directories
   - Each user has `registry.json` and `advisories.json`
   - No DNS needed - direct GitHub raw content access

2. **Path-Only Mode** (from 02-security-integration.md):
   - Complete sandboxing by disabling file/command access
   - Only resolver access allowed

3. **Transitive Import Limits** (from SECURITY.md):
   - Default max depth: 10
   - Configurable in lock file

4. **CLI Command Details** (from 05-cli-commands.md):
   - `mlld install @user/module --ttl 7d --trust verify`
   - `mlld registry add @company github.com/company/modules`

## Recommended Organization

```bash
# Run the reorganization script:
./reorganize-security-docs.sh

# Then move the consolidated vision:
mv SECURITY-VISION.md _dev/specs/security/

# Key documents to reference during implementation:
# - _dev/specs/security/security-vision.md (overall plan)
# - _dev/specs/security/lockfile-design-discussion.md (lock file schema)
# - _dev/workstreams/active/02-security-integration.md (wiring guide)
```

## Documents That Can Be Archived

These are superseded by newer docs or SECURITY-VISION.md:
- BASIC-SECURITY.md (early MVP, concepts evolved)
- HASH-CACHE.md (mostly implemented)
- SECURITY-REGISTRY-INTEGRATION.md (concepts merged into main vision)
- Various TODO files (outdated task lists)

The key is that SECURITY-VISION.md now serves as the authoritative source, with the workstream documents providing implementation details.