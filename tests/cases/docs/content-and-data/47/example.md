/var @file = <config.json>

# ✗ This loses metadata
/var @result = @file | @process          # @process gets string, no .ctx

# ✓ Keep structured form
/exe @process(file) = `Name: @file.ctx.filename, Tokens: @file.ctx.tokens`
/var @result = @file.keep | @process