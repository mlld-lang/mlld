/var @files = <docs/*.md>

# ✗ This won't work - loop variable is unwrapped text
/for @file in @files => show @file.ctx.filename   # Error: .ctx on string

# ✓ Access via array index
/for @i in [0, 1, 2] => show @files[@i].ctx.filename

# ✓ Or use @keep helper to preserve structure
/for @file in @files.keep => show @file.ctx.filename