---
description: Regression test for angle bracket literal parsing in templates
issue: Comparison operators like <70% should not be parsed as file references
---

# Angle Bracket Literals in Templates

This test ensures that `<` characters in templates are correctly identified as:
- File references when content contains `.`, `*`, or `@`
- Literal text when they don't match file reference patterns

## Comparison Operators

### Less than with percentage
/var @test1 = `confidence <70%`
/show @test1

### Less than with space
/var @test2 = `score < 70 points`
/show @test2

### Greater than
/var @test3 = `value >90%`
/show @test3

## XML/HTML Literals

### XML tag
/var @xmlTag = `content with <div> tag`
/show @xmlTag

### HTML elements
/var @htmlContent = `text <span>emphasized</span> more text`
/show @htmlContent

## File References Still Work

### Simple file reference
/var @fileRef = `content from <angle-bracket-test.txt> here`
/show @fileRef

### File with @ symbol
/var @varFile = `load <@base/angle-bracket-test.txt>`
/show @varFile
