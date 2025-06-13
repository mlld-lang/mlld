# Custom Path Resolver Support

## Overview

Enable organizations to create custom path resolvers that map @ prefixes to specific directory structures, network locations, or context-dependent paths beyond the built-in @PROJECTPATH resolver.

## Core Concept

Teams need custom path resolution like:
- `@docs` → `./documentation/` or remote docs
- `@config` → environment-specific paths  
- `@workspace` → monorepo workspace mapping
- `@assets` → CDN or shared network locations

Custom resolvers would use MCP (Model Context Protocol) for external communication and integrate with the unified resolver architecture.

## Dependencies

- Unified resolver architecture implementation
- MCP protocol integration