# JSON backslash-n preserved through shell commands

Regression test for issue #456: When JSON data containing `\n` (literal backslash-n)
is piped through shell commands like echo, the escape sequences must be preserved.

/var @data = '[{"test":"foo\n\nbar"}]'
/exe @echo(d) = run { echo @d }
/var @result = @echo(@data)
/show @result
