# Pipeline Inline Output to File

Inline pipeline output to a file, then read it via @base.

/var @write = "file content inline" | output @input to "x-inline.txt"
/show <@base/x-inline.txt>

