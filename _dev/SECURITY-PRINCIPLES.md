# mlld Security Principles

Last Updated: 2025-05-29

This document outlines the core security philosophy of mlld and the principles that guide all security-related decisions.

## Core Philosophy

**Security should protect users from real risks without getting in their way.**

We focus on actual threats that mlld users face, not theoretical vulnerabilities. Every security measure must have a clear threat model and user benefit.

## Fundamental Principles

### 1. Progressive Trust

**Start restrictive, allow gradual expansion of trust.**

```mlld
# First use - prompts for approval
@import { api } from @sketchy/module

# After approval - cached decision
@import { api } from @sketchy/module  # No prompt

# Explicit trust level
@import { api } from @sketchy/module <trust always>
```

**Rationale**: Users can start safely and gradually trust modules/commands as they verify them. Trust decisions are recorded and can be revoked.

### 2. Offline-First Security

**Security must work without internet connectivity.**

- All security policies stored locally
- Advisories cached for offline use
- Content-addressed storage prevents tampering
- No phone-home for security checks

**Rationale**: Developers work offline. Security that requires internet creates vulnerability windows and privacy concerns.

### 3. Content Addressing

**Identity equals content, verified by cryptographic hash.**

```
@user/module → Fetch → SHA-256 → Cache by hash → Verify on use
```

- Immutable content cache
- Tamper-proof by design
- No trust in transport needed
- Efficient deduplication

**Rationale**: Like Git, content addressing provides integrity without complex PKI infrastructure.

### 4. Real Risks Only

**Focus security on actual attack vectors.**

Priority risks:
1. **Command injection** - Running malicious shell commands
2. **Data exfiltration** - Sending sensitive data externally  
3. **Path traversal** - Accessing sensitive files
4. **Supply chain** - Malicious modules
5. **LLM manipulation** - AI generating harmful code

Non-priorities:
- Theoretical cryptographic attacks
- Complex capability systems
- Performance-killing sandboxes
- Security theater

**Rationale**: Security resources are limited. Focus on what actually protects users.

## Security Model

### Trust Zones

```
┌─────────────────────────┐
│   🔴 Untrusted Zone     │
│ • User input            │
│ • Network content       │
│ • LLM output            │
└───────────┬─────────────┘
            │
      Security Checks
            │
┌───────────▼─────────────┐
│   🟡 Verification Zone  │
│ • Show risks            │
│ • Request approval      │
│ • Record decision       │
└───────────┬─────────────┘
            │
      User Approval
            │
┌───────────▼─────────────┐
│   🟢 Trusted Zone      │
│ • Approved commands     │
│ • Cached modules        │
│ • User's files          │
└─────────────────────────┘
```

### Precedence Rules

**Security flows down, performance bubbles up.**

#### Security Precedence (Restrictive Wins)
```
Global Block > Local Block > File Policy > Default
     ↓             ↓            ↓           ↓
   NEVER        NEVER        verify      verify
```

If something is blocked globally, it cannot be overridden locally.

#### Performance Precedence (Specific Wins)  
```
File TTL > Local Lock TTL > Global Lock TTL > Default
    ↓           ↓              ↓              ↓
   live        1h             7d            static
```

More specific contexts can optimize performance.

**Rationale**: Security must be enforceable by admins/parents. Performance can be tuned by users.

## Practical Security

### Interactive Security

**Show, don't tell.**

Bad:
```
Error: Security policy violation 0x4A3F
```

Good:
```
⚠️  This command wants to delete files:
    rm -rf ./node_modules

This is a common cleanup command that removes downloaded packages.

Allow? [y/N]
```

### Contextual Decisions

**Security decisions need context.**

```mlld
# Development environment - more permissive
@run [npm test] <trust always>

# Production environment - more restrictive  
@run [deploy.sh] <trust verify>
```

### Transparent Operations

**Users should understand what mlld is doing.**

- Clear approval prompts
- Audit trail of decisions
- Explanations of risks
- No hidden behavior

## Implementation Guidelines

### 1. Fail Securely
- Default to denial
- Require explicit approval
- Clear error messages
- Safe fallback behavior

### 2. Defense in Depth
- Parser restrictions
- Interpreter validation
- Command analysis
- Network policies
- Content verification

### 3. Least Privilege
- Minimal permissions requested
- Granular approval options
- Revocable decisions
- Time-limited trusts

### 4. User Control
- Override capabilities (with audit)
- Export/import security decisions
- Clear security status
- Easy policy management

## Security Anti-Patterns to Avoid

### 1. Security Theater
❌ "Scanning for viruses..." (when not really scanning)  
❌ Complex policies nobody understands  
❌ Warnings for safe operations  

### 2. All-or-Nothing Security
❌ "Enable security? [y/n]"  
❌ Sudo-style blanket permissions  
❌ No granular controls  

### 3. Buried Settings
❌ Security settings in config files  
❌ No UI for security decisions  
❌ Unclear current security state  

### 4. Crying Wolf
❌ Warning about everything  
❌ Scary language for minor risks  
❌ No risk differentiation  

## Threat-Specific Mitigations

### Command Injection
- Analyze command patterns before execution
- Highlight dangerous patterns to user
- Block known malicious patterns
- Require approval for first use

### Path Traversal  
- Validate all paths before access
- Restrict to project directory by default
- Clear warnings for parent directory access
- Block access to system directories

### Data Exfiltration
- Track data flow with taint analysis
- Warn when tainted data goes to network
- Require approval for external requests
- Log all network operations

### Supply Chain Attacks
- Content addressing prevents tampering
- Advisory system for known issues
- Reputation system for publishers
- Offline verification capability

### LLM Manipulation
- Treat LLM output as untrusted
- Same security checks as user input
- Clear marking of AI-generated content
- Human approval required

## Privacy Principles

### Local-First Privacy
- No telemetry by default
- Security checks run locally
- No module usage tracking
- Optional, explicit analytics

### Minimal Data Collection
- Only collect what improves security
- Anonymous aggregation only
- User controls all data
- Clear data retention policies

## Evolution Strategy

### Gradual Enhancement
1. Start with basic command blocking
2. Add path validation
3. Implement taint tracking
4. Build advisory system
5. Add advanced analysis

### Community-Driven
- Public security discussions
- Community advisory reviews
- Transparent decision process
- Recognition for researchers

### Backward Compatibility
- Security additions don't break existing scripts
- Clear migration paths
- Grandfather trusted operations
- Version-specific policies

## Success Metrics

Good security is measured by:
- **Low false positive rate** (<5%)
- **Clear, actionable warnings**
- **Fast security checks** (<10ms)
- **High user understanding** (>90%)
- **Actual attacks prevented**

Not measured by:
- Number of warnings shown
- Complexity of policies  
- Theoretical attack coverage
- Security certification

## Conclusion

mlld security is designed to be:
- **Practical** - Solves real problems
- **Transparent** - Users understand decisions
- **Progressive** - Grows with user needs
- **Fast** - Doesn't slow down work
- **Private** - Respects user data

By following these principles, we create a security system that actually protects users without getting in their way.