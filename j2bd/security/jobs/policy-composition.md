# Job (DRAFT): Policy Composition in Practice

## Scenario

I need to combine policies from a security team, a project, and my own local overrides. The combined policy must preserve strict denies while allowing safe commands from each layer.

## The Core Problem

Single policy objects do not represent real-world constraints. Teams need composable policy layers with clear, deterministic merge rules.

## The Solution

Use `union(...)` to merge policy objects. Validate allow/deny intersections, keychain allowlists, and label rules across layers.

## Key Atoms Needed

- policies
- policy-composition
- policy-capabilities
- policy-label-flow

## Relevant Spec Sections

- Part 3: Policy (Declarative Controls)
- Part 5: Capability Controls

## Success Criteria

### Phase 1: Documentation

- [ ] policy-composition atom explains union semantics
- [ ] policy-capabilities atom covers allow/deny precedence
- [ ] policy-label-flow atom shows label denies in composed policy

### Phase 2: Implementation

- [ ] Compose a team policy, project policy, and local override
- [ ] Demonstrate allow/deny intersection on commands
- [ ] Demonstrate combined label rules

### Phase 3: Verification & Remediation

- [ ] Confirm deny lists take precedence in merged policy
- [ ] Confirm allow lists intersect for capabilities
- [ ] Confirm label deny rules still trigger

### Exit Criteria

Unioned policy behavior matches documented merge rules, with clear examples for each layer.

## Example Code (Target)

```mlld
policy @team = {
  defaults: { unlabeled: "untrusted" },
  capabilities: {
    allow: ["cmd:git:*", "cmd:npm:*"],
    deny: ["cmd:rm:*"]
  }
}

policy @project = {
  capabilities: {
    allow: ["cmd:node:*"],
    deny: ["cmd:curl:*"]
  },
  labels: {
    secret: { deny: ["exfil"] }
  }
}

policy @local = {
  capabilities: {
    allow: ["cmd:jq:*"]
  }
}

policy @combined = union(@team, @project, @local)

run cmd { git status }      >> allowed
run cmd { curl example.com } >> denied
```
