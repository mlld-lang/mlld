# Security Testing Checklist for mlld

## Pre-Test Setup
- [ ] Create isolated test environment
- [ ] Backup any sensitive files
- [ ] Ensure test user has limited permissions
- [ ] Document system state before testing

## Command Injection Tests

### Basic Injection Attempts
- [ ] Test: `@text cmd = "; ls -la"` then `run [echo {{cmd}}]`
- [ ] Test: `@text cmd = "| cat /etc/passwd"` then `run [echo {{cmd}}]`
- [ ] Test: `@text cmd = "&& rm -rf /"` then `run [echo {{cmd}}]`
- [ ] Test: `@text cmd = "$(whoami)"` then `run [echo {{cmd}}]`
- [ ] Test: `@text cmd = "\`id\`"` then `run [echo {{cmd}}]`
- [ ] Verify: Commands are properly escaped and not executed

### Advanced Injection
- [ ] Newline injection: `@text cmd = "test\n; malicious command"`
- [ ] Null byte injection: `@text cmd = "test\x00; command"`
- [ ] Unicode escapes: Various unicode escape attempts
- [ ] Nested interpolation: `{{{{nested}}}}`

### Template Injection
- [ ] Test: `@text evil = "{{system('id')}}"` in templates
- [ ] Test: `@text evil = "{{eval('malicious code')}}"` 
- [ ] Test: Server-side template injection patterns
- [ ] Verify: Templates don't execute arbitrary code

## Path Traversal Tests

### File Access
- [ ] Test: `@path file = "../../../etc/passwd"`
- [ ] Test: `@path file = "/etc/passwd"`
- [ ] Test: `@path file = "~/../../root/.ssh/id_rsa"`
- [ ] Test: `@path file = "C:\\Windows\\System32\\config\\SAM"`
- [ ] Verify: Access is restricted appropriately

### URL Access
- [ ] Test: `@text content = @url "file:///etc/passwd"`
- [ ] Test: `@text content = @url "http://169.254.169.254/"` (AWS metadata)
- [ ] Test: `@text content = @url "http://localhost:22"` (port scanning)
- [ ] Test: `@text content = @url "gopher://localhost:25"` (protocol smuggling)
- [ ] Verify: URL protocols and destinations are restricted

### Import Paths
- [ ] Test: `@import { * } from "../../../etc/passwd"`
- [ ] Test: `@import { * } from "~/sensitive.mld"`
- [ ] Test: Symbolic link traversal
- [ ] Test: Hard link traversal

## Resource Exhaustion

### CPU Exhaustion
- [ ] Test: Deeply nested foreach loops
- [ ] Test: Complex regex in templates
- [ ] Test: Exponential template expansion
- [ ] Test: Infinite recursion attempts

### Memory Exhaustion  
- [ ] Test: Very large data structures
- [ ] Test: Infinite string concatenation
- [ ] Test: Memory bombs in JSON
- [ ] Test: Circular reference expansion

### Disk Exhaustion
- [ ] Test: `@output { file: "/dev/zero" }`
- [ ] Test: Writing to disk in loops
- [ ] Test: Creating many files
- [ ] Test: Large file generation

## Input Validation

### Variable Names
- [ ] Test: Special characters in variable names
- [ ] Test: Reserved words as variables
- [ ] Test: Very long variable names
- [ ] Test: Unicode in variable names

### Data Validation
- [ ] Test: Malformed JSON in @data
- [ ] Test: Binary data in strings
- [ ] Test: Invalid UTF-8 sequences
- [ ] Test: Control characters

### Command Validation
- [ ] Test: Binary in commands
- [ ] Test: Very long commands
- [ ] Test: Null bytes in commands
- [ ] Test: Invalid shell syntax

## Network Security

### SSRF Prevention
- [ ] Test: Internal network access via URLs
- [ ] Test: Cloud metadata endpoints
- [ ] Test: Local services (localhost:xxxx)
- [ ] Test: Alternative IP formats (decimal, hex)

### DNS Rebinding
- [ ] Test: URLs that resolve differently
- [ ] Test: Time-based DNS changes
- [ ] Test: Multiple A records

### Request Smuggling
- [ ] Test: HTTP header injection
- [ ] Test: Protocol confusion
- [ ] Test: Port restrictions

## Cryptographic Security

### Module Integrity
- [ ] Test: Modified module detection
- [ ] Test: Hash validation bypass attempts
- [ ] Test: Man-in-the-middle scenarios
- [ ] Test: Downgrade attacks

### Secure Random
- [ ] Test: Predictable random values
- [ ] Test: Seed manipulation
- [ ] Test: Timing attacks

## Information Disclosure

### Error Messages
- [ ] Test: Do errors reveal system paths?
- [ ] Test: Do errors reveal internal state?
- [ ] Test: Stack traces in production?
- [ ] Test: Debug information leakage?

### Timing Attacks
- [ ] Test: User enumeration via timing
- [ ] Test: Path existence via timing
- [ ] Test: Command success via timing

### Side Channels
- [ ] Test: Resource usage patterns
- [ ] Test: Cache timing
- [ ] Test: Output differences

## Permission Security

### File Permissions
- [ ] Test: Reading files without read permission
- [ ] Test: Writing to read-only locations
- [ ] Test: Executing non-executable files
- [ ] Test: Changing file permissions

### User Privileges
- [ ] Test: Privilege escalation attempts
- [ ] Test: Sudo command injection
- [ ] Test: SUID/SGID abuse
- [ ] Test: Capability abuse

## Parser Security

### Parser Exploits
- [ ] Test: Parser DoS (catastrophic backtracking)
- [ ] Test: Parser buffer overflows
- [ ] Test: Unicode normalization attacks
- [ ] Test: Encoding confusion

### Grammar Exploits
- [ ] Test: Ambiguous grammar exploitation
- [ ] Test: Recursive descent limits
- [ ] Test: Lookahead buffer exhaustion

## Security Configuration

### Default Security
- [ ] Test: Are secure defaults enforced?
- [ ] Test: Can security be disabled?
- [ ] Test: Are warnings shown for insecure operations?

### Security Options
- [ ] Test: URL allowlist/blocklist
- [ ] Test: Command restrictions
- [ ] Test: Path restrictions
- [ ] Test: Import restrictions

## Compliance Tests

### Output Security
- [ ] Test: Sensitive data in output
- [ ] Test: Log injection
- [ ] Test: Output encoding
- [ ] Test: Format string bugs

### Input Sanitization
- [ ] Test: All user inputs sanitized
- [ ] Test: Environment variables cleaned
- [ ] Test: Command arguments escaped
- [ ] Test: File names validated

## Security Best Practices

### Least Privilege
- [ ] Verify: Minimal permissions required
- [ ] Verify: No unnecessary capabilities
- [ ] Verify: Sandboxing where possible

### Defense in Depth
- [ ] Verify: Multiple security layers
- [ ] Verify: Fail-safe defaults
- [ ] Verify: Security monitoring hooks

## Reporting Security Issues

For any security vulnerabilities found:
1. **DO NOT** create public GitHub issues
2. **DO** follow responsible disclosure
3. **DO** document full reproduction steps
4. **DO** assess severity and impact
5. **DO** suggest remediation

## Post-Test Cleanup
- [ ] Remove all test files
- [ ] Restore system state
- [ ] Clear sensitive data
- [ ] Document findings securely
- [ ] Verify no backdoors remain