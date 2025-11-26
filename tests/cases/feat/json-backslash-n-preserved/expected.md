# JSON backslash-n preserved through shell commands

Regression test for issue #456: When JSON data containing `\n` (literal backslash-n)
is piped through shell commands like echo, the escape sequences must be preserved.

[
  {
    "test": "foo\n\nbar"
  }
]
