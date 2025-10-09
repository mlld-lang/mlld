/exe @echo_stdin(data) = run { cat } with { stdin: @data }
/var @data = '{"test": [1,2,3]}' | @json
/show @echo_stdin(@data)
