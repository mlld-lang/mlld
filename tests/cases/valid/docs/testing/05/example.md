/var @result = run {echo "test"}
/var @test_echo_works = @result.trim() == "test"

# Test JavaScript execution
/var @js_result = js { return "computed" }
/var @test_js_execution = @js_result == "computed"