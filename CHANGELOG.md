# Changelog

All notable changes to the mlld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [10.3.0] - 2025-03-07

### Fixed
- Fixed compatibility issues when using mlld in ESM environments (projects with "type": "module")
- Resolved "Dynamic require of 'fs' is not supported" error in ESM contexts
- Updated module export configuration for proper TypeScript type resolution in both ESM and CommonJS environments

### Improved
- Enhanced build configuration to better handle Node.js built-in modules 
- Improved fs-extra imports to use consistent naming patterns
- Added "type": "commonjs" to package.json for explicit module system declaration

## [10.2.5] - 2025-03-06

### Improved
- Switched to llmxml 1.4 for nicer formatting of output

## [10.2.4] - 2025-03-06

### Fixed
- Fixed code fence duplication bug in output formats
- Updated OutputService to handle code fence nodes correctly without adding extra fence markers
- Modified unit tests to match the new code fence handling behavior

## [10.2.3] - 2025-03-06

### Fixed
- Fixed CLI output filename handling to consistently use `.o.{format}` extension pattern
- Fixed XML format handling to properly identify and use XML format instead of defaulting to markdown
- Updated filename generation logic to prevent source file overwriting issues

## [10.2.2] - 2025-03-06

### Added
- Improved output filename handling with consistent `.o.{format}` extension pattern
- Added automatic incremental filename generation when output file exists and user declines overwrite
- Enhanced XML output format with direct integration with the llmxml library

### Fixed
- Fixed XML output format not generating proper XML tags via CLI and API
- Fixed potential source file overwriting issues with improved naming conventions
- Simplified XML conversion to directly leverage the llmxml library without unnecessary fallbacks
- Improved filename conflict resolution with user prompts and incremental naming
- Added tests to verify XML output format works correctly, especially with JSON content
- Fixed TypeScript build error by properly awaiting async llmxml.toXML call

## [10.1.2] - 2025-03-06

### Fixed
- Fixed critical shell command syntax errors when using commands with special characters like parentheses
- Fixed multi-line text processing issues in commands, particularly affecting the `llm` command
- Improved error handling for shell commands to prevent syntax errors from appearing in output
- Enhanced command execution to safely handle shell special characters and properly preserve multi-line content

## [10.1.1] - 2025-03-06

### Fixed
- Fixed issue with global installation failing due to missing `reflect-metadata` dependency
- Enhanced the bin wrapper script to better resolve dependencies
- Added dependency verification script that runs on installation

## [10.1.0] - Previous Release

Initial versioned release. 