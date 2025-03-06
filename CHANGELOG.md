# Changelog

All notable changes to the Meld project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [10.2.1] - 2025-03-06

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

## [10.1.2] - 2025-03-06

### Fixed
- Fixed critical shell command syntax errors when using commands with special characters like parentheses
- Fixed multi-line text processing issues in commands, particularly affecting the `oneshot` command
- Improved error handling for shell commands to prevent syntax errors from appearing in output
- Enhanced command execution to safely handle shell special characters and properly preserve multi-line content

## [10.1.1] - 2025-03-06

### Fixed
- Fixed issue with global installation failing due to missing `reflect-metadata` dependency
- Enhanced the bin wrapper script to better resolve dependencies
- Added dependency verification script that runs on installation

## [10.1.0] - Previous Release

Initial versioned release. 