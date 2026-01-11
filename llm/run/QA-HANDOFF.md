# QA Testing Infrastructure - Session Handoff

## What We're Building

An automated QA system that spawns Claude agents to test mlld documentation against reality. Each agent:
1. Reads the howto for a specific topic (e.g., `variables-basics`)
2. Tries the documented examples
3. Reports whether reality matches the docs
4. Creates `results.json` with structured feedback

**Goal:** Catch broken promises, unclear errors, outdated docs, and friction points.

## Why

mlld has 120+ atoms (doc pages) covering syntax, commands, patterns, etc. Manual testing doesn't scale. This system:
- Tests docs automatically as we change things
- Catches regressions before users hit them
- Generates structured feedback for prioritization
- Can run in parallel (10 agents at once)

## How It Works

### The QA Script (`llm/run/qa.mld`)

```bash
mlld run qa --tier 1              # Test tier 1 atoms (15 core syntax)
mlld run qa --tier 1,2            # Test tier 1 and 2 (37 total)
mlld run qa --topic variables     # Filter by prefix
mlld run qa --topics a,b,c        # Specific list
```

The script:
1. Loads all atoms via alligator glob: `<@base/docs/src/atoms/**/*.md>`
2. Filters to atoms with `qa_tier` in frontmatter
3. Applies tier/topic filters from CLI payload
4. Spawns Claude agents in parallel(10) for each topic
5. Agents write results to `qa/{topic}/results.json`

### The qa_tier System

Atoms have `qa_tier` in their YAML frontmatter:

```yaml
---
id: variables-basics
qa_tier: 1
---
```

| Tier | Description | Count |
|------|-------------|-------|
| 1 | Core syntax - isolated, fast | 15 |
| 2 | Commands, control flow - needs context | 22 |
| 3 | Integration, patterns - complex (future) | - |
| absent | Skip - meta docs, SDK config, mistakes | ~80 |

Documented in `docs/dev/DOCS.md`.

### @payload Access Pattern

CLI flags become `@payload` fields:
```bash
mlld run qa --tier 1 --topic variables
```

In script, use namespace import for optional fields:
```mlld
import "@payload" as @payload
var @tier = @payload.tier ? @payload.tier : ""
var @topic = @payload.topic ? @payload.topic : ""
```

**Key fix this session:** Ternary conditions now pass `isCondition: true` so missing field access returns undefined instead of throwing. This makes the `@payload.field ? @payload.field : default` pattern work.

## What Was Fixed This Session

### 1. @payload Resolution Bug (P0)
- **Problem:** `@payload.field` in ternary threw error instead of returning undefined
- **Fix:** `interpreter/eval/expressions.ts:209` - pass `isCondition: true` when evaluating ternary condition
- **Test coverage:** 5 new tests in `tests/sdk/dynamic-modules.test.ts`

### 2. Empty @payload Injection
- **Problem:** Running `mlld run script` with no flags meant `@payload` didn't exist
- **Fix:** `cli/commands/run.ts` always injects `@payload` (empty `{}` if no flags)

### 3. Dynamic Topic Loading
- **Before:** Hardcoded list of 25 topics
- **After:** Loads from atoms via glob, filters by `qa_tier` frontmatter

### 4. Documentation
- Created `docs/src/atoms/syntax/payload.md` - @payload access patterns
- Created `docs/src/atoms/configuration/cli-run.md` - mlld run command
- Updated `docs/src/atoms/configuration/sdk-dynamic-modules.md` - fixed examples
- Updated `docs/dev/DOCS.md` - added qa_tier section

## Current State of qa.mld

The script works but leans heavily on JavaScript escape hatches:

```mlld
exe @extractQaTopics(files, tierFilter) = js {
  let allowedTiers = null;
  if (tierFilter && tierFilter !== '') {
    allowedTiers = new Set(tierFilter.split(',').map(t => parseInt(t.trim(), 10)));
  }
  return files
    .filter(f => {
      const tier = f.fm?.qa_tier;
      if (!tier) return false;
      if (allowedTiers && !allowedTiers.has(tier)) return false;
      return true;
    })
    .map(f => f.fm.id)
    .filter(id => id && !id.startsWith('_'));
}
```

This is doing:
1. Parse comma-separated tier string
2. Filter files by frontmatter field
3. Extract IDs from frontmatter
4. Filter out underscore-prefixed IDs

## Next Session Goals

### 1. Make qa.mld More Native mlld

Review the script and replace JS escape hatches with native mlld patterns. Use `mlld howto` to find better approaches:

```bash
mlld howto                    # See all topics
mlld howto grep "filter"      # Search for patterns
mlld howto for-arrow          # Specific topic
```

**Questions to explore:**
- Can we filter arrays with `for` + `when` instead of JS `.filter()`?
- Can we use native string methods instead of JS `.split()`, `.map()`?
- Is there a better pattern for accessing frontmatter fields?

### 2. Identify mlld Improvement Opportunities

As you refactor, note where mlld syntax is awkward or missing:

**Potential improvements to capture as beads:**
- Array filtering: `@arr[?condition]` vs `for @x in @arr when condition`
- Glob directory listing: Get just filenames without loading content?
- Object property existence check: `@obj.field?` without ternary?
- String parsing: Native split/join methods?
- Set operations: Intersection, difference, membership?

### 3. Polish Tier 1 Before Running Full QA

Before spawning agents:
1. Review the 15 tier 1 atoms
2. Ensure examples are testable
3. Run `mlld run qa --tier 1 --topic variables-basics` (single topic test)
4. Then expand to full tier 1

## Key Files

| File | Purpose |
|------|---------|
| `llm/run/qa.mld` | QA orchestration script |
| `llm/run/qa-prompt.att` | Agent prompt template |
| `docs/dev/DOCS.md` | qa_tier documentation |
| `docs/src/atoms/` | Atom source files with qa_tier |
| `interpreter/eval/expressions.ts` | Ternary fix location |
| `cli/commands/run.ts` | CLI payload injection |
| `tests/sdk/dynamic-modules.test.ts` | @payload test coverage |

## Test Commands

```bash
# Verify qa_tier filtering works
mlld run qa --tier 1 --debug   # Should show 15 topics

# Test single topic (fast, no agent spawn)
mlld howto variables-basics    # See what agent will test

# Full tier 1 run (spawns 15 agents)
mlld run qa --tier 1           # Takes several minutes
```

## Beads Filed

- `mlld-ak33` (closed): @payload dynamic module resolution - FIXED
- `mlld-y6ah` (P2): Better error when comments in arrays
- `mlld-19f8` (P2): Arrow/block syntax confusion in for loops
- `mlld-701z` (P2): Document parallel syntax
- `mlld-w7vz` (P1): Restructure tests/cases to align with howto topics

## Commits This Session

```
052237e fix: @payload optional field access in ternary expressions
8cab774 refactor: qa.mld loads topics dynamically from atoms
69c5b9a feat: add qa_tier frontmatter for atom QA testing
```
