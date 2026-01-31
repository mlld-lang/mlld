---
updated: 2026-01-31
tags: #arch, #pipeline, #docs
related-docs: docs/dev/POLISH.md, docs/dev/DOCS.md
related-code: j2bd/
---

# Job-to-Be-Done (J2B) Loop

Iterative documentation and feature development driven by user goals.

## tldr

```bash
mlld j2bd/security/index.mld   # Run the security docs loop
```

The loop picks one task from the plan, does it, validates, commits if green, repeats.

## Concept

J2B inverts the typical "document what exists" approach. Instead:

1. **Define jobs** - What users are trying to accomplish
2. **Write atoms** - Documentation with working examples
3. **Validate examples** - They must actually work
4. **Surface gaps** - Missing features become tickets
5. **Iterate** - Loop until jobs are completable

```
┌─────────────────────────────────────────────────────────────────┐
│  Jobs (what users want)                                         │
│    "Prevent data exfiltration"                                  │
│    "Sandbox an agent"                                           │
│    "Package env config"                                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Loop                                                           │
│    1. Load fresh: spec, atoms, plan, jobs                       │
│    2. Pick ONE task from plan (highest priority)                │
│    3. Write/fix atom OR note impl gap                           │
│    4. Validate all atoms (backpressure)                         │
│    5. Commit if green                                           │
│    6. Continue                                                  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Outputs                                                        │
│    - Working atoms with tested examples                         │
│    - Tickets for impl gaps                                      │
│    - Updated plan tracking progress                             │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
j2bd/<topic>/
  index.mld           # The loop
  plan.md             # What's done, what's next, priorities
  agent.md            # Learnings, how to test, gotchas
  task.att            # Prompt template for each iteration
  jobs/
    job-name.md       # Job specs (what users want to accomplish)
  lib/                # Optional helpers
```

## Key Files

### index.mld

The main loop. Runs until plan shows complete.

```mlld
var @spec = <path/to/spec.md>
var @jobs = <./jobs/*.md>

exe @buildTask(spec, atoms, plan, agentNotes, jobs) = template "./task.att"

var @state = { stop: false }

loop(endless) until @state.stop [
  >> Fresh each iteration
  var @atoms = <docs/src/atoms/topic/*.md>
  var @plan = <./plan.md>

  >> Exit condition
  when @plan.match(/## Status: Complete/) => done "Done"

  >> Build and run task
  var @task = @buildTask(@spec, @atoms, @plan, @agentNotes, @jobs)
  var @result = run cmd { claude -p "@task" }

  >> Backpressure: validate atoms
  var @validation = for parallel(5) @atom in @atoms [
    let @check = run cmd { mlld validate "@atom.mx.path" } with { ok: true }
    => { file: @atom.mx.filename, valid: @check.exitCode == 0, error: @check.stderr }
  ]

  >> Commit if valid
  var @failures = for @v in @validation when !@v.valid => @v
  if @failures.length == 0 [
    run cmd { git add docs/src/atoms/topic/ j2bd/topic/ }
    run cmd { git commit -m "j2b topic: iteration @mx.loop.iteration" } with { ok: true }
  ]

  continue
]
```

### plan.md

Tracks progress. Agent updates this each iteration.

```markdown
# Topic Documentation Plan

## Status: In Progress

## Priority Order

1. **Foundation** - Core concepts everything else builds on
2. **Common Use** - Most frequently needed features
3. **Advanced** - Edge cases, power user features

## Current Focus

### Foundation (Priority 1)
- [ ] concept-overview
- [ ] concept-basics
- [x] concept-syntax (done)

### Common Use (Priority 2)
- [ ] feature-a
- [ ] feature-b

## Completed
- concept-syntax

## Blocked
- feature-c (needs impl work, see ticket m-xxxx)

## Learnings
(Discoveries during iteration)
```

### jobs/*.md

Define what users are trying to accomplish. These provide context for prioritization.

```markdown
# Job: Do Something Useful

## Scenario

I want to [accomplish X] because [reason]. I need:

1. Feature A working
2. Feature B integrated with A
3. Clear error when something goes wrong

## Success Criteria

- Working mlld code that demonstrates all features
- Each feature documented in atoms
- Clear onboarding path from nothing to working

## Key Atoms Needed

- feature-a-overview
- feature-b-basics
- feature-a-with-b

## Example Code (Target)

```mlld
>> What the user should be able to write when done
var @x = doTheThingIWant()
show @x
```
```

### agent.md

Captures learnings across iterations. Agent updates this when discovering gotchas.

```markdown
# Topic J2B Agent Notes

## How to Run

```bash
mlld j2bd/topic/index.mld
```

## How to Test Atoms

```bash
mlld validate docs/src/atoms/topic/some-atom.md
```

## Atom Format

Frontmatter required: id, title, brief, category, parent, tags, updated

## Learnings

### 2026-01-31
- Feature X requires Y to be set first
- Error message for Z is misleading (filed ticket m-xxxx)
```

### task.att

The prompt template. Receives all context and instructs the agent what to do.

```
You are iterating on [topic] documentation.

## Your Context

### Spec
<spec>
{{spec}}
</spec>

### Current Atoms
<atoms>
{{atoms}}
</atoms>

### Plan
<plan>
{{plan}}
</plan>

### Jobs
<jobs>
{{jobs}}
</jobs>

## Your Task

Do ONE thing from the plan. Pick the highest priority incomplete item.

Options:
1. Write a new atom with working examples
2. Fix an existing atom
3. Note an impl gap in plan.md Blocked section
4. Update the plan

## Requirements

- ONE thing per iteration
- Examples must work (they will be validated)
- Keep atoms focused
```

## Creating a New J2B Loop

```bash
mkdir -p j2bd/newtopic/jobs j2bd/newtopic/lib

# Copy template files
cp j2bd/security/index.mld j2bd/newtopic/
cp j2bd/security/task.att j2bd/newtopic/
cp j2bd/security/agent.md j2bd/newtopic/

# Edit paths in index.mld:
#   - @spec path
#   - @atoms path
#   - git add paths

# Create plan.md with your priorities
# Create job specs in jobs/

# Run
mlld j2bd/newtopic/index.mld
```

## Principles

**Fresh context each iteration** - State reloads from files, no context poisoning from failed attempts.

**One thing per iteration** - Focused work, easier to validate, cleaner commits.

**Backpressure via validation** - Atoms must parse. Examples must work. Failures block commits.

**Self-documenting progress** - Plan and agent notes capture learnings for future iterations.

**Jobs drive priorities** - What users want to accomplish determines what gets worked on.

## Comparison to QA/Polish

| Aspect | QA/Polish | J2B |
|--------|-----------|-----|
| Goal | Discover unknown issues | Validate known spec |
| Input | Existing codebase | Spec + job definitions |
| Discovery | Agents explore with limited context | Examples define what to test |
| Output | Issues to fix | Working docs + impl gaps |
| Loop | Phases (flail → review → fix) | Single unified loop |

J2B is for building new documentation systematically. QA/Polish is for finding issues in existing code.

## Parallelization

The loop is sequential (one task at a time) to avoid conflicts. But within the loop:

- Validation runs in parallel: `for parallel(5) @atom in @atoms`
- Multiple atoms can be tested concurrently

For independent topics, run separate J2B loops in different terminals.
