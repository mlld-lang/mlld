# Meld CLI Issues Summary

This document details the current state and known issues with the Meld Command Line Interface (CLI). The CLI is designed to allow users to process Meld files, but is currently facing several implementation issues.

## Overview

The Meld CLI is built on a robust architectural foundation (as detailed in `docs/ARCHITECTURE.md`) but has several key implementation issues preventing full functionality. The core CLI infrastructure is designed to allow users to process Meld files with the command:

```bash
meld file.meld
```

## Current Status

- **Core Functionality**: The CLI code structure is in place (`cli/index.ts`, `bin/meld.ts`)
- **Test Coverage**: CLI tests are implemented but not passing
- **Command Support**: Basic commands like `init` are implemented
- **Build Issues**: The build process is failing to generate the CLI binary

## Critical Issues

1. [Missing Debug Infrastructure](./missing-debug-dependency.md): The tests rely on a non-existent `ContextDebuggerService.js` file, causing build failures
2. [Binary Availability](./cli-binary-availability.md): The CLI binary isn't being correctly built and exposed
3. [Debug Commands](./debug-commands-implementation.md): The debug commands in the CLI have implementation issues

## Implementation Gap

While the core API for processing Meld files works (with some variable resolution bugs being addressed separately), the CLI wrapper has several issues that prevent it from being usable from the command line. The main missing piece is properly building the CLI binary.

## Related Documentation

- `docs/UX.md`: Overview of the target user experience
- `docs/ARCHITECTURE.md`: Details on the system architecture
- `docs/CLI_USAGE.md`: (future) Documentation for CLI usage

## Priority Tasks

1. Fix the missing debug infrastructure dependency
2. Complete the CLI build process
3. Ensure CLI commands can access the necessary services
4. Make the CLI binary available via npm link

---

For more details on specific issues, see the individual issue files in this directory.