# Manual QA: Security Features

This document provides manual testing steps to verify mlld security features work correctly in real usage scenarios.

## Prerequisites

1. **Clean installation**: `npm run build && npm run reinstall`
2. **Fresh project directory**: Create a new test directory outside the mlld repository
3. **Command availability**: Ensure `mlld-security-wip` command is available

## 1. Command Security & Trust Levels

### 1.1 Basic Command Blocking

**Test**: Verify dangerous commands are blocked by default

```bash
# Create test file
cat > dangerous-test.mld << 'EOF'
# Dangerous Command Test

@run [(rm -rf /tmp/test-*)]
EOF

# Run and expect security prompt/blocking
mlld-security-wip dangerous-test.mld
```

**Expected**: 
- Security prompt asking for approval
- Option to approve with trust level (verify, always, never)
- Command execution only after approval

### 1.2 Trust Level: Always

**Test**: Commands with `trust always` execute without prompts

```bash
cat > trusted-test.mld << 'EOF'
# Trusted Command Test

@run trust always [(echo "This command is always trusted")]
@run trust always [(date)]
@run trust always [(whoami)]
EOF

mlld-security-wip trusted-test.mld
```

**Expected**:
- All commands execute immediately
- No security prompts
- Output shows command results

### 1.3 Trust Level: Never

**Test**: Commands with `trust never` are blocked

```bash
cat > blocked-test.mld << 'EOF'
# Blocked Command Test

@run trust never [(echo "This should be blocked")]
EOF

mlld-security-wip blocked-test.mld
```

**Expected**:
- Command is blocked immediately
- Error message indicating security policy denial
- No command execution

### 1.4 Trust Level: Verify

**Test**: Commands with `trust verify` require approval

```bash
cat > verify-test.mld << 'EOF'
# Verification Required Test

@run trust verify [(ls -la)]
@run trust verify [(ps aux | head -5)]
EOF

mlld-security-wip verify-test.mld
```

**Expected**:
- Security prompt for each command
- Clear indication of trust level requirement
- Commands execute only after explicit approval

## 2. Lock File Persistence

### 2.1 Command Approval Persistence

**Test**: Approved commands are saved to lock file

```bash
# First run - should prompt for approval
cat > persistence-test.mld << 'EOF'
@run [(echo "Testing persistence")]
EOF

mlld-security-wip persistence-test.mld
# Approve the command

# Check lock file was created and contains approval
cat mlld.lock.json | jq '.security.approvedCommands'

# Second run - should use saved approval (no prompt)
mlld-security-wip persistence-test.mld
```

**Expected**:
1. First run: Security prompt, approval required
2. Lock file created with command approval entry
3. Second run: No prompt, uses saved approval

### 2.2 Lock File Structure

**Test**: Verify lock file contains proper security metadata

```bash
# After running various security tests above
cat mlld.lock.json | jq '.security'
```

**Expected Structure**:
```json
{
  "security": {
    "approvedCommands": {
      "echo \"Testing persistence\"": {
        "trust": "verify",
        "approvedAt": "2024-..."
      }
    },
    "approvedUrls": {},
    "approvedPaths": {}
  }
}
```

## 3. TTL/Trust URL Behavior

### 3.1 TTL: Static (Cache Forever)

**Test**: Static TTL URLs are cached permanently

```bash
cat > ttl-static-test.mld << 'EOF'
# TTL Static Test

@path resource = "https://httpbin.org/uuid" (static)
@add @resource
@add @resource
@add @resource
EOF

mlld-security-wip ttl-static-test.mld
```

**Expected**:
- First fetch downloads from URL
- Subsequent @add operations use cached content
- All three outputs should be identical (same UUID)

### 3.2 TTL: Live (Always Fresh)

**Test**: Live TTL URLs are never cached

```bash
cat > ttl-live-test.mld << 'EOF'
# TTL Live Test

@path resource = "https://httpbin.org/uuid" (live)
@add @resource
@add @resource
@add @resource
EOF

mlld-security-wip ttl-live-test.mld
```

**Expected**:
- Each @add operation fetches from URL
- All three outputs should be different (different UUIDs)
- No caching behavior

### 3.3 TTL: Duration-Based

**Test**: Duration TTL respects time limits

```bash
cat > ttl-duration-test.mld << 'EOF'
# TTL Duration Test (5 seconds)

@path resource = "https://httpbin.org/uuid" (5s)
@add @resource
@add @resource
EOF

mlld-security-wip ttl-duration-test.mld

# Wait 6 seconds
sleep 6

cat > ttl-duration-test2.mld << 'EOF'
@path resource = "https://httpbin.org/uuid" (5s)
@add @resource
EOF

mlld-security-wip ttl-duration-test2.mld
```

**Expected**:
1. First two @add operations: Same UUID (cached)
2. After 6 seconds: Different UUID (cache expired)

## 4. URL Trust Enforcement

### 4.1 Trust Never: Block URLs

**Test**: URLs with `trust never` are blocked

```bash
cat > url-trust-never.mld << 'EOF'
# URL Trust Never Test

@path blocked = "https://httpbin.org/json" trust never
@add @blocked
EOF

mlld-security-wip url-trust-never.mld
```

**Expected**:
- URL access denied immediately
- Error message about trust policy
- No network request made

### 4.2 Trust Verify: HTTPS Required

**Test**: Trust verify requires HTTPS

```bash
cat > url-trust-verify-http.mld << 'EOF'
# Should fail: HTTP with trust verify

@path insecure = "http://httpbin.org/json" trust verify
@add @insecure
EOF

mlld-security-wip url-trust-verify-http.mld
```

**Expected**: Error about insecure URL not allowed with trust verify

```bash
cat > url-trust-verify-https.mld << 'EOF'
# Should work: HTTPS with trust verify

@path secure = "https://httpbin.org/json" trust verify
@add @secure
EOF

mlld-security-wip url-trust-verify-https.mld
```

**Expected**: Success, JSON content downloaded

### 4.3 Trust Always: Any URL Allowed

**Test**: Trust always bypasses URL security

```bash
cat > url-trust-always.mld << 'EOF'
# Trust Always Test

@path trusted = "http://httpbin.org/json" trust always
@add @trusted
EOF

mlld-security-wip url-trust-always.mld
```

**Expected**: 
- HTTP URL allowed despite being insecure
- JSON content downloaded successfully

## 5. Path Access Security

### 5.1 Sensitive File Protection

**Test**: Sensitive files trigger security checks

```bash
# Create sensitive test file
echo "SECRET_API_KEY=abc123" > .env

cat > path-security-test.mld << 'EOF'
# Path Security Test

@path config = "./.env"
@add @config
EOF

mlld-security-wip path-security-test.mld
```

**Expected**:
- Security prompt for accessing .env file
- Warning about accessing sensitive file
- Content displayed only after approval

### 5.2 Path Trust Levels

**Test**: Path trust levels work correctly

```bash
echo "Safe content" > safe.txt
echo "Sensitive data" > sensitive.txt

cat > path-trust-test.mld << 'EOF'
# Path Trust Test

@path safe = "./safe.txt" trust always
@path sensitive = "./sensitive.txt" trust verify
@path blocked = "./sensitive.txt" trust never

@add @safe
@add @sensitive
@add @blocked
EOF

mlld-security-wip path-trust-test.mld
```

**Expected**:
1. Safe file: Immediate access, no prompt
2. Sensitive file: Security prompt required
3. Blocked file: Access denied, error message

## 6. Security Integration with Imports

### 6.1 Module Import Security

**Test**: Module imports respect security settings

```bash
cat > import-security-test.mld << 'EOF'
# Import Security Test

@import { data } from "https://raw.githubusercontent.com/mlld-lang/examples/main/data.mld" trust verify
@add @data
EOF

mlld-security-wip import-security-test.mld
```

**Expected**:
- Security prompt for URL import
- Trust verification required
- Module content imported after approval

## 7. Taint Tracking

### 7.1 Command Output Taint

**Test**: Command outputs are tracked for security

```bash
cat > taint-test.mld << 'EOF'
# Taint Tracking Test

@text userInput = "rm -rf /"
@run [(echo "User provided: {{userInput}}")]
EOF

mlld-security-wip taint-test.mld
```

**Expected**:
- Security analysis of command with user input
- Potential warning about dangerous content in variables
- Taint propagation through string interpolation

## Verification Checklist

After running all tests, verify:

- [ ] **Command security**: Dangerous commands require approval
- [ ] **Trust levels**: always/verify/never work as expected  
- [ ] **Lock file persistence**: Approvals saved and reused
- [ ] **TTL behavior**: static/live/duration work correctly
- [ ] **URL trust enforcement**: HTTPS requirements enforced
- [ ] **Path security**: Sensitive files protected
- [ ] **Import security**: Module imports require approval
- [ ] **Taint tracking**: User input properly tracked
- [ ] **Error messages**: Clear, helpful security messages
- [ ] **Performance**: No significant slowdown from security checks

## Common Issues

### Issue: "Permission denied" errors
**Solution**: Ensure proper file permissions and test in isolated directory

### Issue: Network timeouts
**Solution**: Use reliable test URLs like httpbin.org, check internet connection

### Issue: Lock file not created
**Solution**: Verify write permissions in project directory

### Issue: Security prompts not appearing
**Solution**: Check SecurityManager initialization, verify not in test mode

## Notes

- These tests should be run in a clean environment outside the mlld repository
- Some tests require network connectivity
- Lock file behavior may vary between first and subsequent runs
- Trust levels can be overridden by user approval choices