# Job: Defaults Rules in Action

## Scenario

I want straightforward guardrails without writing custom guards. I label my operations semantically and enable built-in rules to block risky flows.

**Important:** Built-in rules work with risk classifications (`exfil`, `destructive`, `privileged`) that you apply to your semantic operation labels via `policy.operations`. You don't label functions as `exe exfil` directly - you label them semantically (e.g., `exe net:w`) and configure policy to classify `net:w` operations as having `exfil` risk.

## The Core Problem

Policies are powerful but verbose for common patterns. Users need built-in rules that enforce safe defaults with minimal configuration.

## The Solution

Use `defaults.rules` with a two-step pattern:
1. Label operations semantically (`net:w`, `fs:w`, etc.)
2. Configure policy to classify semantic labels as risk categories (`exfil`, `destructive`, `privileged`)
3. Enable built-in rules that block dangerous flows

## Key Atoms Needed

- labels-sensitivity
- labels-trust
- policy-label-flow
- policy-operations (operation risk classification)
- policies

## Relevant Spec Sections

- Part 3: Policy (Declarative Controls)
- Part 3.1: Operations Classification
- Part 4: Guards (Expressive Controls)

## Success Criteria

### Phase 1: Documentation

- [ ] defaults.rules described with concrete examples
- [ ] rule names map to data-label and risk-classification pairs
- [ ] policy.operations section explained with examples
- [ ] two-step pattern clearly documented

### Phase 2: Implementation

- [ ] Declare defaults.rules in policy
- [ ] Define semantic operation labels (net:w, fs:w)
- [ ] Configure policy.operations to classify semantic labels as risk categories
- [ ] Show secrets blocked from operations classified as exfil
- [ ] Show untrusted data blocked from operations classified as destructive

### Phase 3: Verification & Remediation

- [ ] Confirm `no-secret-exfil` blocks secret output via classified operations
- [ ] Confirm `no-untrusted-destructive` blocks destructive ops
- [ ] Verify error messages include rule name
- [ ] Verify two-step pattern is clearly explained

### Exit Criteria

Built-in rules enforce common protections using the two-step pattern (semantic labels + policy classification) with minimal configuration.

## Example Code (Target)

```mlld
>> Step 1: Configure policy with rules AND operation classifications
policy @config = {
  defaults: {
    rules: [
      "no-secret-exfil",           # Blocks: secret → exfil
      "no-sensitive-exfil",        # Blocks: sensitive → exfil
      "no-untrusted-destructive",  # Blocks: untrusted → destructive
      "no-untrusted-privileged"    # Blocks: untrusted → privileged
    ]
  },
  operations: {
    # Classify semantic labels as risk categories
    "net:w": exfil,              # Network writes are exfiltration risk
    "op:output": exfil,          # File output is exfiltration risk
    "op:cmd:curl": exfil,        # Curl commands are exfiltration risk
    "op:cmd:rm": destructive,    # rm commands are destructive
    "op:sh": destructive,        # Shell access is destructive
    "fs:w:root": privileged      # Writing to root is privileged
  }
}
policy @p = union(@config)

>> Step 2: Define operations with semantic labels (not risk labels directly)
exe net:w @postToServer(data) = run cmd {
  curl -d "@data" https://example.com/collect
}

exe destructive @deleteFile(path) = run cmd {
  rm -rf "@path"
}

exe privileged @updateSystemConfig(value) = run cmd {
  echo "@value" > /etc/myapp.conf
}

>> Step 3: Use with labeled data - rules apply automatically

>> Test 1: Secret → exfil (BLOCKED)
var secret @token = "sk-live-123"
@postToServer(@token)
>> Error: Label 'secret' cannot flow to 'exfil'
>> (no-secret-exfil rule blocks because net:w is classified as exfil)

>> Test 2: Untrusted → destructive (BLOCKED)
var untrusted @userInput = "../../etc/passwd"
@deleteFile(@userInput)
>> Error: Label 'untrusted' cannot flow to 'destructive'
>> (no-untrusted-destructive rule blocks because destructive operations are classified)

>> Test 3: Untrusted → privileged (BLOCKED)
@updateSystemConfig(@userInput)
>> Error: Label 'untrusted' cannot flow to 'privileged'
>> (no-untrusted-privileged rule blocks)

>> Test 4: Normal data flows freely (ALLOWED)
var @safeValue = "hello-world"
@postToServer(@safeValue)  # Works - no sensitive labels, exfil is OK
@deleteFile("/tmp/test")   # Works - trusted literal, destructive is OK
```

## Understanding the Two-Step Pattern

### Why Not `exe exfil @send()`?

The spec intentionally separates semantic meaning from risk classification:

**Semantic labels** (portable across projects):
- `net:w` - writes to network
- `net:r` - reads from network
- `fs:w` - writes to filesystem
- `fs:r` - reads from filesystem

**Risk classifications** (project-specific):
- `exfil` - data leaves the system
- `destructive` - modifies state
- `privileged` - elevated access

**Benefits:**
1. **Reusable** - `exe net:w @post()` has same meaning everywhere
2. **Flexible** - One project might classify `net:w` as `exfil`, another might not
3. **Composable** - Different policies can classify same operations differently
4. **Clear intent** - Code shows what operation does (semantic), policy shows risk (classification)

### How Built-in Rules Work

Built-in rules check combinations of:
- **Data labels** (secret, sensitive, untrusted) on inputs
- **Risk classifications** (exfil, destructive, privileged) from policy.operations

The rule `no-secret-exfil` blocks when:
1. Input has `secret` label
2. Operation has `exfil` classification (via policy.operations)

## Alternative: Direct Classification

If you want to classify raw commands without wrappers, add them directly:

```mlld
policy @config = {
  defaults: {
    rules: ["no-secret-exfil"]
  },
  operations: {
    "op:cmd:curl": exfil,    # All curl commands classified as exfil
    "op:output": exfil       # All output commands classified as exfil
  }
}

var secret @token = "sk-123"
run cmd { curl -d "@token" example.com }  # BLOCKED
output @token to "file.txt"                # BLOCKED
```

This works but loses the flexibility of semantic labeling for wrapped operations.
