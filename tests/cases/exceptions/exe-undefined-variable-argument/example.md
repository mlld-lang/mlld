/exe @testSh(prompt) = sh { echo "got: $prompt" }
/var @result = @testSh(@undefinedVar)
/show @result
