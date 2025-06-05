# MLLD QA Testing - Start Here

## Quick Start for Claude

You've been asked to perform QA testing on mlld. Here's how to begin:

### 1. First Time Setup
```bash
# Verify mlld is installed
mlld --version

# Create a test workspace
mkdir -p ~/mlld-qa-tests
cd ~/mlld-qa-tests

# You're ready to start testing!
```

### 2. Choose Your Testing Task

#### Option A: "Test Everything" (Comprehensive)
Start with the testing guide: `tests/qa/TESTING-GUIDE.md`
- Follow the Pre-Release Testing checklist
- Work through each priority level
- File issues as you find them

#### Option B: "Test Specific Feature" 
Example: "Test the @text directive"
1. Go to `tests/qa/prompts/feature-isolation/text-directive.md`
2. Follow the prompt instructions step by step
3. Use `tests/qa/checklists/core-directives/text-checklist.md` for thorough coverage
4. Report issues using `tests/qa/templates/issue-template.md`

#### Option C: "Find Security Issues"
1. Start with `tests/qa/checklists/security/security-checklist.md`
2. Work through each security category
3. **Important**: Don't create public issues for security vulnerabilities

#### Option D: "Test Real-World Usage"
1. Pick a scenario from `tests/qa/scenarios/real-world/`
2. Try `documentation-generator.md` for a realistic test
3. Document any friction points or confusing behaviors

#### Option E: "Break Things" (Stress Testing)
1. Go to `tests/qa/scenarios/edge-cases/stress-test.md`
2. Try to make mlld fail in interesting ways
3. Document performance limits and failure modes

### 3. Basic Testing Flow

For any test you choose:

```markdown
1. Read the test prompt/checklist
2. Create test files as instructed
3. Run mlld commands
4. Observe behavior
5. Compare to expected results
6. Document any differences
7. Clean up test files
8. Report issues if needed
```

### 4. Quick Test Example

Here's a simple test you can run right now:

```bash
# Create a test file
cat > test-basic.mld << 'EOF'
@text greeting = "Hello, QA Tester!"
@data info = {"task": "Testing mlld", "status": "active"}

@text message = [[
{{greeting}}

Current task: {{info.task}}
Status: {{info.status}}
]]

@add @message
EOF

# Run it
mlld test-basic.mld

# Expected output:
# Hello, QA Tester!
# 
# Current task: Testing mlld
# Status: active

# Clean up
rm test-basic.mld
```

### 5. What to Test First?

Based on priority and impact, test in this order:

1. **Core Functionality** (30 min)
   - `prompts/feature-isolation/text-directive.md`
   - `prompts/feature-isolation/data-directive.md`
   - Verify basic features work

2. **Integration** (30 min)
   - `prompts/feature-integration/text-data-integration.md`
   - Check features work together

3. **Error Handling** (20 min)
   - `prompts/error-scenarios/error-handling.md`
   - Ensure good error messages

4. **Real-World Scenario** (20 min)
   - `scenarios/real-world/documentation-generator.md`
   - Test practical usage

### 6. Issue Reporting Quick Guide

When you find a bug:

1. **Reproduce it** - Make sure you can trigger it consistently
2. **Minimize it** - Find the smallest code that shows the problem
3. **Document it** - Use `templates/issue-template.md`
4. **File it** - Create GitHub issue with clear title

Example issue title formats:
- `@text directive fails with unicode variable names`
- `Error message unclear when @import file missing`
- `Performance: foreach slow with 1000+ items`

### 7. Common Things to Look For

While testing, watch for:
- ❌ **Crashes** - mlld shouldn't crash, even with bad input
- 📝 **Bad Errors** - Error messages should be helpful
- 🐌 **Slow Operations** - Note anything unusually slow
- 🔒 **Security Issues** - Can you escape the sandbox?
- 📚 **Doc Mismatches** - Does behavior match documentation?
- 🤔 **Confusion** - Is something unnecessarily complex?

### 8. Testing Commands Cheat Sheet

```bash
# Run mlld with a file
mlld test.mld

# Check version
mlld --version

# Get help
mlld --help

# Run with specific format
mlld test.mld --format json

# Time execution
time mlld test.mld

# Check memory usage
/usr/bin/time -v mlld test.mld 2>&1 | grep "Maximum resident"

# Run and save output
mlld test.mld > output.txt
```

### 9. When You're Done

After each testing session:
1. Clean up all test files
2. File any issues found
3. Create a brief test report using `templates/test-report.md`
4. Note any areas that need more testing

### 10. Need Help?

- **Not sure what to test?** Start with Option B above
- **Found something weird?** Document it even if you're not sure it's a bug
- **Test failed to run?** Check your mlld installation
- **Security issue?** Don't create a public issue

---

**Remember**: The goal is to find issues before users do. Be creative, be thorough, but also be systematic. Happy testing! 🧪