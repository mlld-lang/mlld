# @run Directive Testing Checklist

## Pre-Test Setup
- [ ] Create clean test directory
- [ ] Ensure shell commands are available
- [ ] Have safe test environment (no production data)
- [ ] Backup any important files

## Basic Command Execution

### Simple Commands
- [ ] Echo test: `run [echo "Hello World"]`
- [ ] Date command: `run [date]`
- [ ] PWD: `run [pwd]`
- [ ] List files: `run [ls -la]`
- [ ] Verify output captured correctly

### Command Syntax
- [ ] With brackets: `run [command]`
- [ ] Without brackets (should fail): `@run command`
- [ ] Empty command: `run []`
- [ ] Whitespace handling: `run [  echo   "test"  ]`

### Output Handling
- [ ] Single line output
- [ ] Multi-line output
- [ ] No output (command succeeds silently)
- [ ] Large output (1000+ lines)
- [ ] Binary output behavior

## Variable Interpolation

### Basic Interpolation
- [ ] `@text name = "Alice"` then `run [echo "Hello {{name}}"]`
- [ ] Multiple variables: `run [echo "{{var1}} {{var2}}"]`
- [ ] Variable in middle: `run [echo "pre{{var}}post"]`

### Complex Interpolation
- [ ] Field access: `run [echo "{{user.name}}"]`
- [ ] Array elements: `run [echo "{{items.0}}"]`
- [ ] Nested fields: `run [echo "{{config.db.host}}"]`
- [ ] Special characters in values

## Shell Features

### Operators and Pipes
- [ ] Pipe: `run [echo "test" | wc -l]`
- [ ] Redirect: `run [echo "test" > output.txt]`
- [ ] And operator: `run [echo "1" && echo "2"]`
- [ ] Or operator: `run [false || echo "fallback"]`
- [ ] Semicolon: `run [echo "1"; echo "2"]`

### Environment Variables
- [ ] Set and use: `run [VAR=value echo $VAR]`
- [ ] Export: `run [export TEST=123 && echo $TEST]`
- [ ] PATH usage: `run [echo $PATH]`
- [ ] HOME usage: `run [cd ~ && pwd]`

### Working Directory
- [ ] Change directory: `run [cd /tmp && pwd]`
- [ ] Relative paths: `run [cd .. && pwd]`
- [ ] Create and enter: `run [mkdir testdir && cd testdir && pwd]`

## Advanced Features

### Multiline Commands
```mlld
run [
  echo "Line 1"
  echo "Line 2"
  echo "Line 3"
]
```
- [ ] Verify each line executes
- [ ] Check output ordering
- [ ] Test with pipes between lines

### Command Substitution
- [ ] Backticks: `run [echo `date`]`
- [ ] $() syntax: `run [echo $(whoami)]`
- [ ] Nested: `run [echo $(echo $(date))]`

### Script Execution
- [ ] Inline script: `run [bash -c "for i in 1 2 3; do echo $i; done"]`
- [ ] Python: `run [python3 -c "print('Hello from Python')"]`
- [ ] Other interpreters if available

## Error Handling

### Command Failures
- [ ] Non-existent command: `run [nosuchcommand]`
- [ ] Command returns error: `run [false]`
- [ ] Command killed: `run [sleep 1000]` (then interrupt)
- [ ] Permission denied: `run [/etc/shadow]`

### Syntax Errors
- [ ] Unmatched quotes: `run [echo "test]`
- [ ] Invalid operators: `run [echo "test" ||| invalid]`
- [ ] Missing closing bracket
- [ ] Empty variable interpolation: `run [echo {{}}]`

### Error Messages
For each error:
- [ ] Clear error type
- [ ] Command shown in error
- [ ] Exit code (if applicable)
- [ ] Stderr captured

## Security Tests

### Command Injection
- [ ] Test with user input: `@text input = "; rm -rf /"` then `run [echo {{input}}]`
- [ ] Verify proper escaping
- [ ] Test with backticks in input
- [ ] Test with $() in input

### Path Traversal
- [ ] `run [cat ../../../etc/passwd]`
- [ ] Verify restrictions (if any)
- [ ] Document security model

### Resource Limits
- [ ] Long running: `run [sleep 60]`
- [ ] High memory: `run [yes | head -n 1000000]`
- [ ] Many processes: `run [for i in {1..100}; do echo $i & done]`
- [ ] Document any limits

## Performance Tests

### Execution Speed
- [ ] Time simple command
- [ ] Time complex pipeline
- [ ] Time with large output
- [ ] Compare to direct shell execution

### Output Handling
- [ ] Large output (MB)
- [ ] Very long lines
- [ ] Binary data
- [ ] Streaming vs buffering

### Concurrent Execution
- [ ] Multiple @run in sequence
- [ ] Performance impact
- [ ] Resource usage

## Integration Tests

### With @text Assignment
- [ ] `@text result = run [echo "test"]`
- [ ] Verify assignment works
- [ ] Test with multi-line output
- [ ] Test with empty output

### With @when Conditions
- [ ] `@when run [test -f file.txt] => @add "File exists"`
- [ ] Test with command success/failure
- [ ] Test with output comparison

### With @exec Definition
- [ ] Define parameterized commands
- [ ] Use with @run
- [ ] Test parameter passing

## Platform-Specific Tests

### Shell Differences
- [ ] Test on bash
- [ ] Test on sh
- [ ] Test on zsh (if available)
- [ ] Document shell requirements

### OS-Specific Commands
- [ ] Linux-specific commands
- [ ] macOS-specific (if applicable)
- [ ] Windows WSL (if applicable)
- [ ] Document platform limitations

## Edge Cases

### Special Characters
- [ ] Newlines in commands
- [ ] Tabs and spaces
- [ ] Unicode in commands
- [ ] Control characters

### Empty/Null Cases
- [ ] Empty command: `run []`
- [ ] Whitespace only: `run [   ]`
- [ ] Null byte handling
- [ ] Zero-length output

## Documentation Verification
- [ ] All syntax documented
- [ ] Security model explained
- [ ] Platform requirements clear
- [ ] Examples work correctly

## Cleanup
- [ ] Delete output.txt and test files
- [ ] Remove testdir
- [ ] Kill any hanging processes
- [ ] Restore original directory
- [ ] Document findings