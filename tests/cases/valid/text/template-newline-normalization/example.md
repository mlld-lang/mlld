---
name: template-newline-normalization
description: Test template newline normalization
---

/text @greeting = [[
Hello World!
]]

/text @multiline = [[
First line

Second line


Third line
]]

/text @trailing = [[
Content with trailing blank lines


]]

/add @greeting
/add @multiline
/add @trailing