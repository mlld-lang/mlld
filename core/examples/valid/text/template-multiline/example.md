# Text Template Multiline Example

This document demonstrates a multi-line text template directive.

@text name = "World"
@text greeting = [[
Hello, {{name}}!
]]

The template output should be displayed below:

@add [[{{greeting}}]]