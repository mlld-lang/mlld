# Test: Strict JSON Parsing

/var @strictPayload = '{"project":"mlld","version":"rc61"}'
/var @parsed = @strictPayload | @json.strict
/show @parsed

/var @loosePayload = '{"data":[1,2,3]}'
/var @parsedLooseAlias = @loosePayload | @json.loose
/show @parsedLooseAlias
