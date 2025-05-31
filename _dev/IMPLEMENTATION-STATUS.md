# mlld Implementation Status

Last Updated: 2025-05-29

This document tracks the current state of mlld's security, registry, and module system implementation.

## ✅ Working Features

### Import Security
- **Import approval system** - Prompts user before fetching remote content
- **SHA-256 content pinning** - Locks approved imports by hash
- **Local cache** - Stores approved content in `~/.mlld/cache/`
- **Gist URL transformation** - Converts GitHub URLs to raw content

### Core Interpreter
- All directives (`@text`, `@run`, `@exec`, `@data`, `@path`, `@add`, `@import`)
- Variable resolution and interpolation
- Template system with `{{variable}}` syntax
- Basic file operations

## 🔧 Built but Not Connected

### Security Infrastructure (~/security/)
- **SecurityManager** - Central security coordinator (initialized but unused)
- **CommandAnalyzer** - Detects dangerous command patterns
- **PathValidator** - Validates file paths for directory traversal
- **TaintTracker** - Tracks data from untrusted sources
- **URLValidator** - Validates and restricts URLs
- **AdvisoryChecker** - Checks security advisories (no data source yet)

### Registry System (~/core/registry/)
- **RegistryManager** - Main registry interface
- **RegistryResolver** - Resolves `mlld://` URLs (outdated design)
- **Cache** - Local registry cache
- **LockFile** - Lock file support (not integrated)

### Command Execution
- Mock command execution for testing
- Real command execution works but bypasses security

## 📋 Next Sprint (NOW)

1. **Grammar Updates** - Add TTL `(30m)` and trust `<trust verify>` syntax
2. **Security Integration** - Connect SecurityManager to interpreter
3. **Hash-Cache System** - Implement `@user/module` imports with content addressing
4. **Registry MVP** - Gist-based module storage with DNS
5. **CLI Commands** - `mlld install`, `update`, `rm`, `ls`

## 🔮 Future Plans (LATER)

### Near Future
- Static registry website (browse modules on mlld.ai)
- Advisory system design
- MCP server registry planning
- GitHub repo support (beyond gists)
- Private module support

### Long Term
- Full authenticated registry API
- Community advisories
- MCP server integration
- Private registries for enterprises

## Progress Tracking

| Component | Status | Integration | Notes |
|-----------|--------|-------------|-------|
| Import Security | ✅ Done | ✅ Working | Only security feature actually working |
| Command Analyzer | ✅ Built | ❌ Not connected | Ready to integrate |
| Path Validator | ✅ Built | ❌ Not connected | Ready to integrate |
| Taint Tracker | ✅ Built | ❌ Not connected | Needs interpreter hooks |
| URL Validator | ✅ Built | ❌ Not connected | Ready for URL imports |
| Registry Core | ✅ Built | ❌ Not connected | Needs hash-cache redesign |
| Lock Files | ⚠️ Partial | ❌ Not connected | Exists but needs TTL/trust |
| TTL/Trust | ❌ Not built | ❌ N/A | Grammar work first |
| Hash-Cache | ❌ Not built | ❌ N/A | New import system |
| CLI Commands | ⚠️ Partial | ✅ Working | init, run work; need install/update |

## Key Decisions Made

1. **Import syntax**: `@import { x } from @user/module` (no quotes for modules)
2. **Path syntax**: `@import { x } from [path/to/file.mld]` (brackets for paths)
3. **Hash length**: 4-6 characters minimum for version disambiguation
4. **Module updates**: Like npm - static until explicitly updated
5. **Precedence**: Security (restrictive wins) vs Performance (specific wins)
6. **Registry storage**: GitHub gists with content addressing

## Success Criteria

- [ ] All dangerous commands blocked by default
- [ ] URL imports require approval
- [ ] Modules cached locally by content hash
- [ ] TTL and trust policies enforced
- [ ] Registry modules installable via CLI
- [ ] Lock files track all dependencies with hashes