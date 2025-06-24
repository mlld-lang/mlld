# @text Directive Testing Checklist

## Pre-Test Setup
- [ ] Create a clean test directory
- [ ] Ensure mlld is installed and accessible
- [ ] Have documentation reference available
- [ ] Prepare issue reporting template

## Basic Functionality Tests

### Simple Assignment
- [ ] Test: `@text greeting = "Hello World"`
- [ ] Verify variable is created
- [ ] Test: `@add @greeting`
- [ ] Verify output matches expected value
- [ ] Check for any warnings or unexpected output

### String Variations
- [ ] Empty string: `@text empty = ""`
- [ ] Single character: `@text char = "A"`
- [ ] Numbers as strings: `@text num = "123"`
- [ ] Special characters: `@text special = "!@#$%^&*()"`
- [ ] Escape sequences: `@text escaped = "Line 1\nLine 2\tTabbed"`
- [ ] Quotes in strings: `@text quoted = "She said \"Hello\""`

### Variable Names
- [ ] Lowercase: `@text simple = "test"`
- [ ] With numbers: `@text var123 = "test"`
- [ ] With underscores: `@text my_var = "test"`
- [ ] CamelCase: `@text myVariable = "test"`
- [ ] Starting with number (should fail): `@text 123var = "test"`
- [ ] Reserved words (if any): Document behavior

## Template Tests

### Basic Templates
- [ ] Simple template: `@text t = [[Hello World]]`
- [ ] With variable: `@text name = "Alice"` then `@text g = [[Hello {{name}}]]`
- [ ] Multiple variables: `[[{{var1}} and {{var2}}]]`
- [ ] Verify proper interpolation

### Advanced Templates
- [ ] Nested braces: `[[{{var}} {{ {{nested}} }}]]`
- [ ] Field access: `[[User: {{user.name}}]]`
- [ ] Array access: `[[First: {{items.0}}]]`
- [ ] Missing variable behavior: `[[{{undefined}}]]`

### Multiline Templates
- [ ] Test preservation of line breaks
- [ ] Test indentation preservation
- [ ] Test with markdown formatting
- [ ] Test with code blocks inside

## Assignment From Other Directives

### From @path
- [ ] Create test file with content
- [ ] Use: `@text content = @path_var`
- [ ] Verify content matches file
- [ ] Test with non-existent path

### From @run
- [ ] Simple command: `@text date = run [date]`
- [ ] Command with output: `@text result = run [echo "test"]`
- [ ] Failed command behavior
- [ ] Empty output behavior

### From @add
- [ ] Create section: `@add "content" >> mysection`
- [ ] Retrieve: `@text saved = @add:mysection`
- [ ] Verify content matches
- [ ] Non-existent section behavior

## Edge Cases

### Large Content
- [ ] 1000+ character strings
- [ ] 10,000+ character strings
- [ ] Very long single lines
- [ ] Many lines (1000+)

### Unicode and Encoding
- [ ] UTF-8 characters: "Hello 世界"
- [ ] Emoji: "🚀 🌟 ✨"
- [ ] RTL text: "مرحبا"
- [ ] Mixed scripts

### Performance
- [ ] Time assignment of large strings
- [ ] Time template rendering with many variables
- [ ] Memory usage with large content
- [ ] Note any delays or issues

## Error Handling

### Syntax Errors
- [ ] Missing quotes: `@text bad = hello`
- [ ] Missing name: `@text = "value"`
- [ ] Missing value: `@text name =`
- [ ] Invalid operators: `@text name := "value"`

### Runtime Errors
- [ ] Undefined variable reference
- [ ] Circular references
- [ ] Type mismatches
- [ ] Invalid template syntax

### Error Message Quality
For each error:
- [ ] Is location indicated?
- [ ] Is error type clear?
- [ ] Is fix suggested?
- [ ] Is context shown?

## Integration Points

### With @data
- [ ] Access data fields in templates
- [ ] Handle null/undefined values
- [ ] Type coercion behavior

### With @when
- [ ] Use in conditions
- [ ] Truth/false evaluation
- [ ] Empty string behavior

### With @import
- [ ] Import text variables
- [ ] Name conflicts
- [ ] Export behavior

## Documentation Verification
- [ ] All features documented
- [ ] Examples work as shown
- [ ] Edge cases mentioned
- [ ] Error behaviors documented

## Issues to Report
- [ ] Unexpected behaviors
- [ ] Poor error messages
- [ ] Performance problems
- [ ] Documentation mismatches
- [ ] Missing features

## Post-Test Cleanup
- [ ] Delete test files
- [ ] Remove test directories
- [ ] Clear any generated output
- [ ] Document test results