>> Spaced tail pipeline after template should execute (no args allowed in template body)
/exe @upper(text) = js { return String(text).toUpperCase(); }
/var @t = `hello` | @upper
/show @t