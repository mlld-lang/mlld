# test-module.mld
/import { @helper } from <./my-module.mld>
/var @result = @helper("test")
/when @result == "expected" => show "✓ Pass"
/when @result != "expected" => show "✗ Fail"