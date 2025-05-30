# Security Advisory System Design

**Status**: Planning  
**Priority**: P1 - Critical for security  
**Estimated Time**: 1 week design, 2 weeks implementation  
**Dependencies**: Registry system, Hash-cache

## Objective

Design a community-driven security advisory system for mlld modules, inspired by npm audit but focused on real security impact rather than noise.

## Core Principles

### Quality Over Quantity
- Only advisories with real security impact
- No noise from dev dependencies
- Clear, actionable remediation steps
- Community review process

### Decentralized Trust
- Anyone can submit advisories
- Community validates and votes
- Reputation system for contributors
- Transparent decision process

### Offline-First
- Advisories cached locally
- Work without internet
- Efficient sync protocol
- Privacy-preserving checks

## Advisory Format

### Advisory Structure
```json
{
  "id": "MLLD-2024-0001",
  "title": "Command injection in @user/module",
  "severity": "high",
  "cwe": ["CWE-78"],
  "summary": "The module executes user input without sanitization",
  "details": "Detailed explanation of the vulnerability...",
  "affected": {
    "@user/module": {
      "versions": ["<1.2.0"],
      "hashes": ["a1b2c3d4", "e5f6g7h8"]
    }
  },
  "patches": {
    "@user/module": {
      "version": "1.2.0",
      "hash": "i9j0k1l2"
    }
  },
  "workarounds": "Sanitize input before passing to the module",
  "references": [
    "https://github.com/user/module/security/advisories/GHSA-xxxx"
  ],
  "reporter": {
    "name": "Security Researcher",
    "github": "researcher"
  },
  "metadata": {
    "created": "2024-01-15T10:00:00Z",
    "updated": "2024-01-15T12:00:00Z",
    "votes": {
      "confirm": 15,
      "dispute": 2
    }
  }
}
```

### Severity Levels
- **critical**: Remote code execution, data exfiltration
- **high**: Local code execution, privilege escalation  
- **medium**: Information disclosure, DoS
- **low**: Minor security issues

## System Architecture

### Advisory Repository
```
mlld-lang/advisories/
├── advisories/
│   ├── 2024/
│   │   ├── MLLD-2024-0001.json
│   │   └── MLLD-2024-0002.json
│   └── index.json
├── pending/
│   └── pr-123.json
└── tools/
    ├── validate.js
    └── submit.js
```

### Distribution Methods

1. **Primary**: GitHub repository with JSON files
2. **Mirror**: IPFS for censorship resistance
3. **Cache**: Local ~/.mlld/advisories/
4. **API**: Future registry API endpoint

## Advisory Lifecycle

### Submission Process
1. Researcher discovers vulnerability
2. Submits advisory via PR
3. Automated validation runs
4. Community review period (72 hours)
5. Voting by trusted reviewers
6. Merge if approved
7. Propagate to clients

### Review Criteria
- Reproducible proof of concept
- Clear security impact
- Accurate affected versions
- Working patch/workaround
- No duplicate advisories

### Reputation System
```json
{
  "reviewers": {
    "alice": {
      "reputation": 85,
      "advisories_submitted": 12,
      "advisories_confirmed": 10,
      "review_accuracy": 0.95
    }
  }
}
```

## Client Integration

### Check Command
```bash
# Check current project
mlld audit

# Check specific module
mlld audit @user/module

# Update advisory database
mlld audit update
```

### Output Format
```
mlld audit report
================

found 2 vulnerabilities (1 high, 1 medium)

HIGH: Command injection in @alice/exec-helper@a1b2c3
  Upgrade to @alice/exec-helper@i9j0k1 
  More info: https://mlld.ai/advisory/MLLD-2024-0001

MEDIUM: Information disclosure in @bob/logger@d4e5f6
  No patch available
  Workaround: Disable verbose logging
  More info: https://mlld.ai/advisory/MLLD-2024-0002

Run `mlld update` to install patches
```

### Lock File Integration
```json
{
  "modules": {
    "@alice/exec-helper": {
      "resolved": "a1b2c3d4...",
      "advisories": ["MLLD-2024-0001"],
      "risk": "high"
    }
  }
}
```

## Implementation Plan

### Phase 1: Advisory Format & Repository
1. [ ] Define advisory JSON schema
2. [ ] Create advisories repository
3. [ ] Write validation tools
4. [ ] Create example advisories
5. [ ] Document submission process

### Phase 2: Client Integration
1. [ ] Add audit command to CLI
2. [ ] Implement advisory checking
3. [ ] Add local caching
4. [ ] Create update mechanism
5. [ ] Integrate with install/update

### Phase 3: Community Features
1. [ ] Add voting system
2. [ ] Implement reputation tracking
3. [ ] Create reviewer dashboard
4. [ ] Add automated testing
5. [ ] Build moderation tools

### Phase 4: Advanced Features
1. [ ] IPFS distribution
2. [ ] Signed advisories
3. [ ] Private advisory disclosure
4. [ ] Integration with GitHub Security
5. [ ] Advisory statistics

## Privacy Considerations

### Anonymous Checking
- No phone-home by default
- Local advisory database
- Optional telemetry (opt-in)
- No module list transmission

### Responsible Disclosure
- Private submission channel
- Embargo period support
- Coordinated disclosure
- Credit to researchers

## Success Metrics

- Advisory quality score >90%
- False positive rate <5%
- Time to advisory <48 hours
- Community participation >50 reviewers
- Module coverage >80%

## Future Enhancements

- Machine learning for vulnerability detection
- Automated patch generation
- Integration with GitHub Dependabot
- Cross-language advisory sharing
- Bounty program integration

## Notes

- Start with manual process, automate later
- Focus on mlld-specific vulnerabilities
- Learn from npm audit mistakes
- Build trust through transparency
- Consider legal implications

## Related Documentation

### Architecture & Vision
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security philosophy guiding advisory system design
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - How advisories fit into the registry ecosystem
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Security architecture and advisory integration points

### Specifications
- [`specs/advisory-format.md`](../../specs/advisory-format.md) - Detailed advisory format specification
- [`specs/lock-file-format.md`](../../specs/lock-file-format.md) - How advisories are tracked in lock files
- [`specs/ttl-trust-syntax.md`](../../specs/ttl-trust-syntax.md) - Trust levels for advisory sources

### Related Work
- [`security/registry/AdvisoryChecker.ts`](../../../security/registry/AdvisoryChecker.ts) - Existing advisory checker implementation
- [`archive/2025-05-evolution/ADVISORY-REGISTRY-GOALS.md`](../../archive/2025-05-evolution/ADVISORY-REGISTRY-GOALS.md) - Original advisory system goals