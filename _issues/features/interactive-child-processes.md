# Interactive Child Processes in Meld

## Summary

Enhance the run directive to support fully interactive child processes, allowing user input during command execution. This would enable interactive commands like git commit, npm init, or any other command that prompts for user input to work seamlessly within Meld.

## Motivation

Currently, child processes executed through the `@run` directive can output to the console in real-time, but cannot accept user input. This limits the types of commands that can be effectively used within Meld documents. Supporting interactive processes would:

1. Significantly expand the range of commands that can be executed in Meld
2. Enable complex workflows that require user interaction (e.g., password prompts, configuration wizards)
3. Provide a more natural and seamless experience when working with CLI tools

## Proposed Implementation

### Core Changes

1. Modify the `NodeFileSystem.executeCommand` method to:
   - Use proper TTY handling for child processes
   - Pipe user input to the child process stdin
   - Configure spawn with `{ stdio: ['inherit', 'pipe', 'pipe'] }` or potentially `'inherit'` for fully interactive mode

2. Update the `RunDirectiveHandler` to:
   - Add an option to specify whether a process should be interactive
   - Manage the UI differently for interactive vs non-interactive processes
   - Possibly use a different animation pattern for interactive commands

3. Terminal handling:
   - Ensure proper raw mode handling for interactive terminals
   - Handle control characters appropriately
   - Manage signal forwarding (e.g., Ctrl+C)

### Syntax Proposal

Extend the run directive with an `interactive` option:

```
{@run --interactive git commit}
```

Or potentially:

```
{@run git commit}  # Auto-detect if interactive is needed
```

### Technical Considerations

- **TTY Detection**: May need to detect whether the command typically requires TTY and automatically switch modes
- **Signal Handling**: Ensure signals (SIGINT, etc.) are properly forwarded to child processes
- **Platform Compatibility**: Ensure consistent behavior across different platforms
- **Testing**: Design tests that can simulate user input for interactive processes
- **Edge Cases**: Handle scenarios where processes don't terminate properly

### Challenges

1. **Distinguishing Prompts**: It can be difficult to programmatically distinguish between regular output and a prompt for user input.
2. **Testing Complexity**: Testing interactive processes requires simulating user input, which adds complexity.
3. **Terminal Emulation**: Some interactive applications expect specific terminal capabilities.
4. **Control Characters**: Handling of control characters and escape sequences needs careful implementation.
5. **Platform Differences**: Terminal behavior differs between Windows and Unix-like systems.

## Impact on Existing Code

- The changes would primarily affect the `NodeFileSystem` and `RunDirectiveHandler` classes
- Existing non-interactive commands should continue to work without modification
- Testing infrastructure would need enhancements to support interactive testing

## Additional Research Needed

1. Evaluate different approaches to TTY handling in Node.js
2. Research best practices for interactive process testing
3. Investigate platform-specific considerations for Windows vs Unix
4. Determine the best approach for detecting commands that require interaction
5. Consider security implications of interactive process handling

## Implementation Plan

1. **Investigation Phase**:
   - Research Node.js TTY handling best practices
   - Test different spawn configurations with interactive processes
   - Create prototypes of interactive handling

2. **Development Phase**:
   - Implement TTY-aware child process execution
   - Add interactive mode to RunDirectiveHandler
   - Update documentation and examples

3. **Testing Phase**:
   - Develop testing strategies for interactive processes
   - Create automated tests where possible
   - Manual testing of various interactive scenarios

## Conclusion

Supporting interactive child processes would significantly enhance the capabilities of Meld, enabling more complex and natural workflows. While there are technical challenges to overcome, the benefits justify the investment in this feature.

## Status

- [ ] Research
- [ ] Design
- [ ] Implementation
- [ ] Testing
- [ ] Documentation 