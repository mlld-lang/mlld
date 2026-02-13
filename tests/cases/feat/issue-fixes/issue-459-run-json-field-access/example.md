# Issue #459: JSON field access in run commands

This tests that multiple JSON field accesses work correctly in run commands (fixed in #459).
Now parses once and accesses fields directly.

/exe @display(entry) = run { echo @entry.a @entry.b @entry.c }
/var @entry = '{"a":1,"b":2,"c":3}' | @json

>> Should output: "1 2 3"
/show @display(@entry)
