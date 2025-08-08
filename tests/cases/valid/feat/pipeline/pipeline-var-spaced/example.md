>> Spaced pipeline for variables in /var RHS
/exe @upper(text) = js { return String(text).toUpperCase(); }
/exe @trim(text) = js { return String(text).trim(); }
/var @value = "  hello  "
/var @out = @value | @upper | @trim
/show @out

