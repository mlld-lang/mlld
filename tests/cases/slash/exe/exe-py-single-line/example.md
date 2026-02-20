# Python Single-line `py { ... }` Syntax

Single-line Python code blocks in executable definitions execute without indentation errors.

/exe @addInline(a, b) = py { print(int(a) + int(b)) }
/show `inline: @addInline(2, 3)`

Indented multiline Python code blocks continue to execute.

/exe @addMultiline(a, b) = py {
  print(int(a) + int(b))
}
/show `multiline: @addMultiline(4, 5)`
