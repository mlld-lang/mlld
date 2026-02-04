# Adversarial Verification Results: Sandbox Enforcement

**Job**: Sandbox an Agent (m-74f6)
**Date**: 2026-02-03
**Verifier**: Adversarial Worker

## Executive Summary

| Test Category | Status | Notes |
|--------------|--------|-------|
| Artifact runs end-to-end | PARTIAL | Runs but errors on `policy union()` |
| Credential protection (show) | FAIL | Secret labels do NOT block show |
| Credential protection (interpolate) | FAIL | Secret labels do NOT block interpolation |
| Credential protection (with guard) | PASS | User-defined guards work correctly |
| Policy defaults.rules | FAIL | Rules like "no-secret-exfil" not implemented |
| Policy capabilities.deny | FAIL | Deny list not enforced |
| Policy capabilities.allow | PASS | Allow list IS enforced |
| Docker network isolation | PASS | --network none blocks network |
| Docker filesystem read-only | PASS | :ro mounts are enforced |
| Docker filesystem write paths | PARTIAL | Works for mounts; container fs still writable |
| env block tool restrictions | BLOCKED | Known gap (m-3ad1) |

**Overall Status**: FAILURES FOUND

---

## Test 1: Artifact Runs End-to-End

**Claim**: "mlld sandbox-demo.mld succeeds"

**Command**: `mlld run j2bd/security/impl/sandbox-demo.mld`

**Result**: PARTIAL PASS

The artifact runs and produces most expected output, but errors at the end:
```
Error: Failed to run script: Interpreter error (undefined): Command not found: create
```

The `policy @p = union(@policyConfig)` syntax appears to be problematic.

**Verdict**: The artifact MOSTLY runs but has an error. The core demonstrations work.

---

## Test 2: Credential Protection - show

**Claim**: "Credentials cannot be displayed (via label flow rules)"

**Test Code** (`tmp/adversarial-test-1-secret-show.mld`):
```mlld
var secret @apiKey = "sk-test-12345-secret-value"
show @apiKey
```

**Expected**: Error blocking secret display
**Actual Output**: `sk-test-12345-secret-value`

**Verdict**: **FAIL** - Secret was displayed without any blocking. The `secret` label exists but no default guard/policy enforces it.

---

## Test 3: Credential Protection - interpolation

**Claim**: "Secrets cannot be interpolated into commands"

**Test Code** (`tmp/adversarial-test-2-secret-interpolate.mld`):
```mlld
var secret @apiKey = "sk-test-12345-secret-value"
run cmd { echo "The key is: @apiKey" }
```

**Expected**: Error blocking secret interpolation
**Actual Output**: `The key is: sk-test-12345-secret-value`

**Verdict**: **FAIL** - Secret was interpolated without any blocking.

---

## Test 4: Credential Protection - with explicit guard

**Test Code** (`tmp/adversarial-test-3-secret-with-guard.mld`):
```mlld
guard @noShowSecrets before op:show = when [
  @mx.labels.includes("secret") => deny "Cannot show secret-labeled data"
  * => allow
]

var secret @apiKey = "sk-test-12345-secret-value"
show @apiKey
```

**Expected**: Guard blocks the operation
**Actual Output**:
```
Guard blocked operation: Cannot show secret-labeled data
  Guard: noShowSecrets (for operation:show)
```

**Verdict**: **PASS** - When a guard is explicitly defined, it correctly blocks secret display. Labels propagate correctly.

**Analysis**: The label tracking works. The issue is that **no default guards are active**. The claim that "credential protection: ENFORCED via policy label flow rules" is only true if you define the guards yourself.

---

## Test 5: Policy defaults.rules

**Claim**: "Policy rules like no-secret-exfil provide default protection"

**Test Code** (`tmp/adversarial-test-4-policy-rules.mld`):
```mlld
policy @secure = {
  defaults: {
    rules: ["no-secret-exfil"]
  }
}

var secret @apiKey = "sk-test-12345-secret-value"
show @apiKey
```

**Expected**: Policy rule blocks secret exfiltration
**Actual Output**: `sk-test-12345-secret-value`

**Verdict**: **FAIL** - The `defaults.rules` feature does not enforce anything. The spec mentions these rules but they appear unimplemented.

---

## Test 6: Policy capabilities.deny

**Claim**: "capabilities.deny provides actual enforcement (workaround for m-3ad1)"

**Test Code** (`tmp/adversarial-test-5-capabilities-deny-sh.mld`):
```mlld
policy @noShell = {
  capabilities: {
    deny: ["sh"]
  }
}

run sh { echo "This should not execute" }
```

**Expected**: Shell execution blocked
**Actual Output**: `This should not execute`

**Verdict**: **FAIL** - `capabilities.deny` does NOT block shell execution.

---

## Test 7: Policy capabilities.allow

**Test Code** (`tmp/adversarial-test-6-capabilities-allow.mld`):
```mlld
policy @gitOnly = {
  capabilities: {
    allow: ["cmd:git:*"]
  }
}

run cmd { curl --version }
```

**Expected**: curl blocked (not in allowlist)
**Actual Output**:
```
Guard blocked operation: Command 'curl' denied by policy
  Guard: __policy_cmd_access (for operation:op:cmd)
```

**Verdict**: **PASS** - `capabilities.allow` IS enforced via a policy-generated guard.

---

## Test 8: Policy capabilities.deny with allow

**Test Code** (`tmp/adversarial-test-7-capabilities-both.mld`):
```mlld
policy @safe = {
  capabilities: {
    allow: ["cmd:git:*", "cmd:echo:*"],
    deny: ["cmd:git:push"]
  }
}

run cmd { echo "test" }   >> works
run cmd { git status }     >> works
run cmd { git push origin main }  >> should be blocked
```

**Expected**: git push blocked by deny list
**Actual Output**: All three commands executed successfully, including git push

**Verdict**: **FAIL** - `capabilities.deny` does not provide additional blocking beyond what `allow` provides.

**Analysis**: The asymmetry is clear:
- `capabilities.allow` = ENFORCED (allowlist model)
- `capabilities.deny` = NOT ENFORCED (denylist model doesn't work)

---

## Test 9: Docker Network Isolation

**Claim**: "Network restrictions ENFORCED by Docker provider via --network flag"

**Test Code** (`tmp/adversarial-test-9-docker-network.mld`):
```mlld
import { @create, @execute, @release } from "/Users/adam/dev/mlld/modules/llm/modules/docker.mld"

var @sandbox = {
  image: "alpine:latest",
  net: "none"
}

var @env = @create(@sandbox)

var @result = @execute(@env.envName, {
  argv: ["sh", "-c", "wget -T 5 -O - https://httpbin.org/get 2>&1 || echo NETWORK_BLOCKED"]
})

var @pingResult = @execute(@env.envName, {
  argv: ["sh", "-c", "ping -c 1 -W 2 8.8.8.8 2>&1 || echo PING_BLOCKED"]
})
```

**Expected**: Network requests fail
**Actual Output**:
```
Network test result: {"stdout":"wget: bad address 'httpbin.org'\nNETWORK_BLOCKED\n"...}
Ping test: {"stdout":"PING 8.8.8.8 (8.8.8.8): 56 data bytes\nping: sendto: Network unreachable\nPING_BLOCKED\n"...}
```

**Verdict**: **PASS** - Docker `--network none` correctly blocks all network access.

---

## Test 10: Docker Filesystem Restrictions

**Claim**: "Filesystem limits ENFORCED by Docker provider via -v mounts with :ro"

**Test Code** (`tmp/adversarial-test-10-docker-filesystem.mld`):
```mlld
var @sandbox = {
  image: "alpine:latest",
  fs: {
    read: ["/Users/adam/dev/mlld:/app"],
    write: ["/tmp:/allowed-write"]
  }
}
```

Tests:
1. Write to /allowed-write (should succeed)
2. Write to /app (read-only, should fail)
3. Write to /etc (not mounted, behavior?)
4. Read from /app (should work)

**Actual Output**:
```
Write to /allowed-write: WRITE_SUCCESS
Write to /app (read-only): WRITE_BLOCKED (sh: can't create: Read-only file system)
Write to /etc: WRITE_SUCCESS
Read /app/package.json: -rw-r--r-- ... /app/package.json
```

**Verdict**: **PARTIAL PASS**

- Read-only mounts ARE enforced (:ro suffix works)
- Write mounts work correctly
- **However**: Paths NOT in any mount (like /etc) are writable because they're part of the container's ephemeral filesystem

**Analysis**: This is correct Docker behavior - the restriction is on specific paths, not container-wide. The sandbox-demo.mld claim is accurate: "ENFORCED BY DOCKER PROVIDER via -v mounts with :ro".

---

## Test 11: env Block Tool Restrictions

**Claim**: "Tool restrictions NOT ENFORCED at mlld level (ticket m-3ad1)"

**Status**: BLOCKED - Unable to construct a valid test

The `env @config with { tools: [...] }` syntax controls tool scope, but the underlying enforcement (`isToolAllowed()`) is documented as not being called during execution.

**Verdict**: Matches documented gap (m-3ad1). No additional testing possible without the enforcement code.

---

## Summary of Findings

### Working (PASS)

1. **Docker network isolation** (`net: "none"`) - Fully enforced
2. **Docker filesystem read-only mounts** - Fully enforced
3. **Policy capabilities.allow** - Fully enforced as allowlist
4. **User-defined guards for secrets** - Labels propagate correctly, guards work

### Not Working (FAIL)

1. **Credential protection without guards** - `secret` label has no default enforcement
2. **Policy defaults.rules** - Rules like "no-secret-exfil" don't activate guards
3. **Policy capabilities.deny** - Denylist is parsed but not enforced
4. **Bare secret show/interpolation** - No protection without explicit guards

### Known Gaps (Documented)

1. **env-level tool enforcement (m-3ad1)** - `isToolAllowed()` exists but not called
2. **MCP restrictions (m-289d)** - `mcps: []` syntax parsed but not enforced

---

## Recommendations

1. **Critical**: Either implement `defaults.rules` guards or update sandbox-demo.mld to NOT claim "credential protection: ENFORCED via policy label flow rules" without showing the guard definition.

2. **Critical**: Fix `capabilities.deny` to actually block denied operations, or document this limitation prominently.

3. **Important**: The sandbox-demo.mld should show a complete working example that includes:
   - The guard definition for secret protection
   - A test that demonstrates the guard blocking

4. **Documentation**: Update enforcement status table to be accurate:
   - `defaults.rules`: NOT IMPLEMENTED
   - `capabilities.deny`: NOT IMPLEMENTED
   - Secret label flow: REQUIRES EXPLICIT GUARDS

---

## Test Files Created

All test files are in `tmp/`:
- `adversarial-test-1-secret-show.mld`
- `adversarial-test-2-secret-interpolate.mld`
- `adversarial-test-3-secret-with-guard.mld`
- `adversarial-test-4-policy-rules.mld`
- `adversarial-test-5-capabilities-deny-sh.mld`
- `adversarial-test-6-capabilities-allow.mld`
- `adversarial-test-7-capabilities-both.mld`
- `adversarial-test-8-docker-env.mld`
- `adversarial-test-9-docker-network.mld`
- `adversarial-test-10-docker-filesystem.mld`
