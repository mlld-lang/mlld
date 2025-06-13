# GitHub Resolver for Private Modules

## Overview

Extend the existing GitHub resolver to support private repository access for secure organization-specific module distribution.

## Core Concept

Organizations need to share mlld modules internally without making them publicly available. This would enable:

- Private repository authentication (tokens, SSH, GitHub Apps)
- Organization module patterns: `@myorg/auth-utils` → `github.com/myorg/mlld-modules`
- Mixed public/private module dependencies
- Team-based access control and audit logging

Example usage:
```mlld
@import { deployConfig } from @myorg/deploy-tools  # Private
@import { httpUtils } from @mlld/http              # Public
```

## Dependencies

- Enhanced resolver architecture with authentication
- Secure credential management system