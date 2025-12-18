/var @files = <docs/*.md>

# ✗ This won't work - loop variable is unwrapped text
/for @file in @files => show @file.mx.filename   # Error: .mx on string

# ✓ Access via array index
/for @i in [0, 1, 2] => show @files[@i].mx.filename

# ✓ Or use @keep helper to preserve structure
/for @file in @files.keep => show @file.mx.filename