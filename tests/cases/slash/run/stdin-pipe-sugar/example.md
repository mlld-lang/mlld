/var @payload = '{"name":"Ada","value":42}'
/run @payload | cmd {cat}
/run cmd {cat} with { stdin: @payload }
