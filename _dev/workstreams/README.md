# mlld Workstreams

This directory organizes development work into focused workstreams based on priority and dependencies.

## Directory Structure

### NOW/ - Current Sprint
Active development work that should be completed in the current sprint. These are P0 priority items with clear implementation paths.

- **01-grammar-ttl-trust.md** - Grammar updates for TTL and trust syntax
- **02-security-integration.md** - Wire up existing security components  
- **03-hash-cache-imports.md** - New module import system
- **04-registry-gists.md** - MVP registry using GitHub gists
- **05-cli-commands.md** - Module management CLI commands

### NEXT/ - Upcoming Work
Planned features that depend on NOW items or need more design work. These are P1-P2 priority.

- **registry-static-site.md** - Browse modules on mlld.ai
- **advisory-design.md** - Security advisory system
- **mcp-registry-design.md** - MCP server integration

### LATER/ - Future Plans
Long-term vision items that require significant effort or aren't fully specified yet.

(Empty for now - items will move here from NEXT as needed)

## Working with Workstreams

### Starting a Task
1. Pick a workstream document from NOW/
2. Review dependencies and requirements
3. Follow the implementation steps
4. Check off completed items
5. Update IMPLEMENTATION-STATUS.md

### Creating New Workstreams
Use this template:

```markdown
# [Feature Name]

**Status**: Not Started | In Progress | Complete  
**Priority**: P0 | P1 | P2  
**Estimated Time**: X days  
**Dependencies**: List other workstreams or features

## Objective
Clear description of what we're building and why.

## Design/Specification
Technical details, syntax examples, architecture.

## Implementation Steps
### Phase 1: [Name] (Day 1)
1. [ ] Specific task
2. [ ] Another task

## Success Criteria
- [ ] Measurable outcome
- [ ] User-facing feature works

## Notes
Additional context, gotchas, future considerations.
```

### Moving Workstreams
- NOW → Complete: Archive to `_dev/archive/` with completion date
- NEXT → NOW: When dependencies are met
- NOW → NEXT: If blocked or deprioritized
- Idea → LATER: For future features

## Current Focus

The immediate priority is implementing the security and module system:

1. **Grammar** - Enable TTL/trust syntax (no dependencies)
2. **Security** - Connect existing components (depends on grammar)  
3. **Modules** - Hash-cache imports (depends on grammar)
4. **Registry** - Gist-based MVP (depends on modules)
5. **CLI** - User-facing commands (depends on all above)

These five workstreams can be worked on somewhat in parallel, with grammar being the critical path.