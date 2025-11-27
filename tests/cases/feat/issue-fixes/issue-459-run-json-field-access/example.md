# Issue #459: JSON field access in run commands

This tests that multiple JSON field accesses work correctly in run commands (fixed in #459).
Now uses `.data` accessor to parse JSON strings.

/exe @display(entry) = run { echo @entry.data.a @entry.data.b @entry.data.c }
/var @entry = '{"a":1,"b":2,"c":3}'

>> Should output: "1 2 3"
/show @display(@entry)
