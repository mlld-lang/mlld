---
id: ownership-permissions
qa_tier: 3
title: Ownership and Permissions
brief: Module owners, maintainers, and organization namespaces
category: modules
tags: [modules, registry, ownership, permissions, organizations]
related: [publishing-public, registry-metadata]
related-code: [cli/commands/publish.ts]
updated: 2026-02-24
---

## Module Owners

After your first PR merges, you become module owner:
- Can publish updates directly (no PR needed)
- Can add maintainers
- Module namespaced under your GitHub username

## Maintainers

Add collaborators to `metadata.json`:

```json
{
  "owners": ["alice"],
  "maintainers": ["bob", "eve"]
}
```

Maintainers can also publish updates.

## Organization Modules

Publish under org namespace:

```yaml
---
author: company
name: auth-tool
---
```

Requires write access to `@company` in registry.
