/var @obj = '{"file": 1}' | @json
/exe @echo(data) = cmd { echo "@data"}
/var @result = @echo(@obj)
/show @result
