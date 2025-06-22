**Warning: Directive in middle of text line**

The line `Some text @add @myvar in the middle of a line.` contains a directive that doesn't start at the beginning of the line.

mlld directives are only processed when they appear at the start of a line. Directives in the middle of text lines are treated as literal text.

**To fix this:**
```mlld
Some text 
/add @myvar
in the middle of a line.
```