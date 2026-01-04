/exe @pipeInline(value) = cmd { printf "%s" "@value" | tr a-z A-Z }
/show @pipeInline("abc123")
