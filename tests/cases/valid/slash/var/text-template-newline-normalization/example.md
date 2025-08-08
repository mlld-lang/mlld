---
name: template-newline-normalization
description: Test template newline normalization
---

/var @greeting = ::
Hello World!
::

/var @multiline = ::
First line

Second line


Third line
::

/var @trailing = ::
Content with trailing blank lines


::

/show @greeting
/show @multiline
/show @trailing