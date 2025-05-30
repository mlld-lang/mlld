# Workstream Updates from RECAP.md

## Summary of Changes Made

### 03-hash-cache-imports.md
1. **No angle brackets in trust syntax**: Updated example from `<trust verify>` to `trust verify`
2. **Extended module paths**: Updated grammar to support `@namespace/path/to/module` format
3. **Resolver integration**: Added resolver checking to RegistryClient
4. **Security emphasis**: Added note that this system forms foundation of security model
5. **Transitive dependencies**: Added dependency tracking to lock file format
6. **Import depth limit**: Added to success criteria (3 levels max)
7. **Path-only mode**: Added as success criteria

### 04-registry-gists.md
1. **Public-first naming**: Changed `registry.mlld.ai` to `public.mlld.ai` throughout
2. **Clear PUBLIC nature**: Emphasized in objective that these are PUBLIC modules
3. **Resolver flow**: Added resolver checking before DNS lookup
4. **Dependency tracking**: Added dependencies to module metadata format
5. **Private isn't a feature**: Added note that private modules use different resolvers

### 05-cli-commands.md
1. **Security integration**: Added note about resolver system enabling secure distribution
2. **Transitive approval**: Added dependency approval flow to install command
3. **Security options**: Added `--trust` and `--ttl` flags to install
4. **Lock file update**: Added full security policy and registries sections
5. **Honest security**: Added SecurityWarning that warns but doesn't block
6. **Transparency note**: Added notes about showing users what mlld is doing

## Key Insights Reflected

1. **Resolvers ARE the Security Model**: All three workstreams now emphasize that resolvers are the security boundary, not just convenience features.

2. **Public-First**: The registry is clearly positioned as PUBLIC with the `public.mlld.ai` domain.

3. **No Angle Brackets**: Grammar examples updated to remove angle brackets from trust syntax.

4. **Transitive Dependencies**: All workstreams now include handling of transitive dependencies with depth limits.

5. **Honest Security**: CLI shows warnings but doesn't block - users decide risk tolerance.

## Still Needed

The following workstreams still need to be created/updated:
- **06-resolver-system.md**: Needs to be created to detail the resolver architecture
- **07-frontmatter-support.md**: Needs to be created for frontmatter parsing
- **08-interpreter-updates.md**: Needs to be created for `@input`/`@output` support

## Integration Points

All three updated workstreams now properly reference:
- Resolver system as security boundary
- Public nature of the default registry
- Content-addressed immutable cache
- Transitive dependency tracking
- User control and transparency