# Active Workstreams

This directory contains the active implementation work for mlld's security and module system.

## Workstream Overview

### Phase 1: Core Infrastructure (In Progress)
These workstreams focus on implementing the missing core components:

1. **[08-policy-manager.md](./08-policy-manager.md)** - Implement PolicyManager for rule evaluation
   - Status: Not started
   - Dependencies: Lock file schema
   - Priority: **HIGH** - Blocks SecurityManager

2. **[09-ttl-trust-enforcement.md](./09-ttl-trust-enforcement.md)** - Connect TTL/trust to execution
   - Status: Not started  
   - Dependencies: Grammar (complete)
   - Priority: **HIGH** - Core feature

3. **[10-security-integration.md](./10-security-integration.md)** - Wire SecurityManager to interpreter
   - Status: Not started
   - Dependencies: PolicyManager
   - Priority: **HIGH** - Nothing works without this

### Phase 2: Automation & UX
These improve the user experience:

4. **[11-lock-file-automation.md](./11-lock-file-automation.md)** - Auto-create and update lock files
   - Status: Not started
   - Dependencies: Security integration
   - Priority: **MEDIUM** - Quality of life

5. **[12-approval-flow-ux.md](./12-approval-flow-ux.md)** - Context-aware approval flows
   - Status: Not started
   - Dependencies: Lock file automation
   - Priority: **MEDIUM** - Better UX

### Existing Workstreams (From Earlier Planning)
These were created during initial planning and may need updates:

- **[01-grammar-ttl-trust.md](./01-grammar-ttl-trust.md)** - Grammar updates
  - Status: **COMPLETE** ✅ - TTL/trust syntax implemented in grammar
  
- **[02-security-integration.md](./02-security-integration.md)** - Original security plan
  - Status: Partially outdated - see workstream 10 for updated approach
  
- **[03-hash-cache-imports.md](./03-hash-cache-imports.md)** - Hash-based caching
  - Status: Partially complete - HashUtils exists, cache needs work
  
- **[05-cli-commands.md](./05-cli-commands.md)** - CLI implementation
  - Status: Mostly complete - install/ls work, need update command
  
- **[07-frontmatter-support.md](./07-frontmatter-support.md)** - Frontmatter parsing
  - Status: **COMPLETE** ✅ - Frontmatter fully supported

## Implementation Order

Based on dependencies, the recommended order is:

1. **Start with PolicyManager (08)** - Unblocks everything else
2. **Then Security Integration (10)** - Makes security actually work
3. **Then TTL/Trust Enforcement (09)** - Leverages security integration
4. **Then Lock File Automation (11)** - Improves workflow
5. **Finally Approval Flow UX (12)** - Polish the experience

## Success Metrics

### Phase 1 Complete When:
- [ ] Commands go through security checks
- [ ] TTL controls caching behavior  
- [ ] Trust levels affect execution
- [ ] Lock files record decisions

### Phase 2 Complete When:
- [ ] Lock files created automatically
- [ ] Approvals persist across sessions
- [ ] Context-aware trust rules work
- [ ] Security UX is smooth

## Testing Strategy

Each workstream includes specific test scenarios. Additionally:

1. **Integration Tests**: Full flow from import to execution
2. **Security Tests**: Attempt to bypass restrictions
3. **Performance Tests**: Overhead should be < 10ms
4. **UX Tests**: Approval flow usability

## Notes

- All components exist, they just need to be connected
- Focus on integration over new features
- Security should enhance, not hinder productivity
- Keep the split precedence model in mind (security down, performance up)