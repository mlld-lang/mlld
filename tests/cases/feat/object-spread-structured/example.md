# Test: Object Spread with Structured Value

/var @jsonText = '{"team":"mlld","active":true}'
/var @parsed = @jsonText | @json
/var @result = { name: "Project", ...@parsed }
/show @result
