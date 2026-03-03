## Documentation Consolidation Strategy

We are evaluating whether to consolidate mlld's documentation by:

1. **Replacing docs/user/*.md** (website docs) with content built from docs/src/atoms/ (atomic reference docs)
2. **Keeping standalone "explainer" articles** for conceptual/philosophical content that doesn't fit the atom format
3. **Moving examples from plugins/mlld/examples/ to docs/src/examples/** for unified CLI access

### Content Types

| Type | Purpose | Format | Example |
|------|---------|--------|---------|
| **Atom** | "How does X work?" | Self-contained, code-first, one concept | `docs/src/atoms/flow-control/when.md` |
| **Explainer** | "Why does X work this way?" | Article-style, narrative, motivational | `docs/user/introduction.md` |
| **Example** | "Here's X in a real project" | Complete working .mld project | `plugins/mlld/examples/audit/` |

### What We Need From This Audit

**Phase 1 - Gap Analysis**: For each docs/user/ file, identify:
- Content that maps cleanly to existing atoms (covered, safe to drop)
- Content that SHOULD be an atom but isn't (gap — need new atom)
- Content that is conceptual/narrative and should become an explainer
- Content that is outdated, wrong, or redundant (safe to drop)

**Phase 2 - Taxonomy Review**: Evaluate the atom organization:
- Do the current 8 categories work for website nav?
- Are there atoms that are miscategorized?
- What groupings would work for `mlld howto` topic listing?
- Would the website need different groupings than the CLI?
