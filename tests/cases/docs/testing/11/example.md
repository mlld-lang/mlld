# ✅ Good - one assertion per test
/var @test_array_length = @data.length() == 3
/var @test_first_item = @data[0] == "apple"
/var @test_includes_banana = @data.includes("banana")

# ❌ Bad - multiple assertions in one test
/var @test_array_stuff = @data.length() == 3 && @data[0] == "apple" && @data.includes("banana")