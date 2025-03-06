we need to better handle cases where we're using the @run command and running a commmand that includes a progress animation (Processing...)

It would be ideal to have a default mode where we swallow the output until the command is finished and then truncate it with a 

Then if the user wants the whole output they can do `--verbose` for the command output

Example of what happens if running a command with an animation:

```
❯❯❯ meld examples/deck/chain.meld
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`Writing response... (90 chars) 
(node:55158) ExperimentalWarning: CommonJS module /Users/adam/dev/oneshot/dist/src/logger.js is loading ES Module /Users/adam/dev/oneshot/node_modules/chalk/source/index.js using require().
Support for loading ES Module in require() is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
(node:55158) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
```
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`..
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`...
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`....
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`.
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`..
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`...
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`....
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`.
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`..
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`...
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"`....
.
Running `oneshot "Make a plan to fix @run [oneshot "What's broken here? @run [npm test]"]"` ✔
I'll help you create a plan to fix the issue with `@run [npm test]`. First, let's understand what's broken.

To fix the issue, I would need to know the error that occurs when running `npm test`. However, without seeing the actual error message from the command, I'll need to make a general plan for troubleshooting:

## Plan to Fix the Issue

1. **Run the test command and observe the error**
   - Execute `npm test` and carefully read the error message
   - Identify whether it's a syntax error, missing dependency, configuration issue, or failed test

2. **Check for missing dependencies**
   - Run `npm install` to ensure all dependencies are installed
   - Check package.json to verify test script configuration

3. **Examine test configuration**
   - Check test framework configuration (Jest, Mocha, etc.)
   - Verify test files are in the correct location

4. **Fix specific issues based on error messages**
   - If syntax errors: fix the code in the identified location
   - If missing modules: install required dependencies
   - If test failures: debug and correct the failing code

5. **Verify the fix**
   - Run `npm test` again to confirm the issue is resolved
   - If new errors appear, address them one by one

Without the specific error message, this is a general approach. If you provide the exact error that appears when running `npm test`, I can give you more targeted advice for fixing the issue.

File examples/deck/chain.md already exists. Overwrite? [Y/n] 
✅ Successfully processed Meld file and wrote output to examples/deck/chain.md
```

thinking about this more, in reality we probably need to also handle this in processing the output for the meld built output. we want the full output, but we don't want to output the `processing...` in the final document