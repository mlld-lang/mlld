/exe @testSh(prompt) = sh { echo "got: $prompt" }
/var @result = @testSh("user@example.com")
/show @result
