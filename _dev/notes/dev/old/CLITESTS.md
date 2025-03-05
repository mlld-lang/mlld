Based on the CLI tests I've examined, here's a bulleted list of the key test cases that should be preserved for future reference when rebuilding the CLI:

## Basic CLI Functionality
- **Process simple meld file without errors**
  - Verify CLI can process a basic file with no errors
  - Check proper exit code (no exit on success)

- **Handle command line arguments correctly**
  - Parse and apply format options (md, llm)
  - Handle stdout flag
  - Process input file path correctly

- **Handle file I/O correctly**
  - Read input files from specified paths
  - Write output to specified paths
  - Create output files with correct content

## CLI Error Handling
- **Handle missing input file errors properly**
  - Detect when input file doesn't exist
  - Display appropriate error message
  - Exit with non-zero code

- **Handle parse errors properly**
  - Detect syntax errors in meld files
  - Display helpful error messages with location info
  - Exit with non-zero code

- **Respect strict flag for error handling**
  - In strict mode, fail on any error
  - In non-strict mode, continue with warnings for recoverable errors

## CLI Output Options
- **Respect output format options**
  - Generate correct format based on --format flag
  - Use correct file extension for output
  - Apply format-specific transformations

- **Handle stdout option correctly**
  - Output to console instead of file when --stdout is used
  - Don't create output file when using stdout

## Path Variable Handling
- **Handle PROJECTPATH special variables correctly**
  - Resolve $PROJECTPATH/$. to correct project directory
  - Support path variables in meld content

- **Handle HOMEPATH special variables correctly**
  - Resolve $HOMEPATH/$~ to correct home directory
  - Support path variables in meld content

## Text Variable Handling
- **Handle text variable interpolation correctly**
  - Process and interpolate text variables
  - Support variable references in content

## Additional CLI Features
- **Support watch mode**
  - Monitor input file for changes
  - Regenerate output when input changes
  - Handle file system events properly

- **Support version and help commands**
  - Display version information
  - Show help text with command options

- **Handle environment variables**
  - Process ENV_* variables correctly
  - Apply environment variable values in content

## Path Forward for the API-First Approach

Now that we have preserved the key CLI test requirements, I agree with your approach to:

1. Delete the current CLI implementation and tests
2. Focus solely on completing and strengthening the API
3. Build a new CLI as a thin wrapper on top of the completed API

Here's a concrete plan for moving forward:

### 1. Strengthen the API Implementation

1. **Enhance API Integration Tests**:
   - Create comprehensive tests that cover all Meld functionality
   - Focus on path handling with special variables
   - Test variable resolution, imports, and commands
   - Ensure transformation mode works correctly
   - Test different output formats

2. **Improve Path Handling in API**:
   - Ensure PathService works correctly in all contexts
   - Add robust tests for special path variables
   - Create utilities for path testing in the test environment

3. **Complete Service Validation**:
   - Ensure all services initialize in the correct order
   - Validate service dependencies
   - Add comprehensive error handling

### 2. Build a New CLI Wrapper

Once the API is solid, create a minimal CLI wrapper:

1. **Create Simple CLI Entry Point**:
   - Parse command line arguments
   - Map CLI options to API options
   - Call API's main function with mapped options

2. **Add CLI-Specific Features**:
   - Implement watch mode
   - Add version and help commands
   - Handle stdout output

3. **Implement Error Handling**:
   - Map API errors to CLI error messages
   - Set appropriate exit codes
   - Support strict mode

### 3. Test the New CLI

1. **Create CLI-Specific Tests**:
   - Test command line argument parsing
   - Test CLI-to-API option mapping
   - Test error handling and exit codes

2. **Reimplement the Key Test Cases**:
   - Use the bulleted list as a reference
   - Focus on CLI-specific functionality
   - Leverage the robust API tests for core functionality

This approach will result in a cleaner architecture with less duplication, and the CLI will benefit from the well-tested API underneath.

Would you like me to help with any specific part of this plan, such as enhancing the API tests or improving path handling in the API?
