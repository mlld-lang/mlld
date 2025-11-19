/exe @trimPrefix(value) = js { return value.trim().slice(0,4); }
/exe @js = { trimPrefix }
/var @text = "  sample  "
/var @result = @trimPrefix(@text.trim().slice(1)).toUpperCase()
/show @result
