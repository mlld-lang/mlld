# GitHub Issue: Object Property Access in Function Arguments

This test specifically verifies the scenarios described in the GitHub issue.

>> Module imports would fail here, so we'll define simple test functions
/exe @eq(@a, @b) = js {return a === b ? "PASS" : `FAIL: expected '${b}' but got '${a}'`}
/exe @ok(@val) = js {return val === true ? "PASS" : `FAIL: expected true but got '${val}'`}

>> Test object property access in different contexts
/var @user = {"name": "Alice", "age": 30, "active": true}

>> This works fine (already verified):
/show `User name: @user.name`
/show `User age: @user.age`
/show `User active: @user.active`

>> This previously failed with "Variable not found: user.name"
>> First let's verify property access works in simple assignment
/var @user_name = @user.name
/show `Extracted name: @user_name`

>> Now test in function argument
/var @test_name = @eq(@user.name, "Alice")
/show `Test name: @test_name`

/var @test_age = @eq(@user.age, 30)
/show `Test age: @test_age`

/var @test_active = @ok(@user.active)
/show `Test active: @test_active`

>> Also test nested objects
/var @company = {"name": "Acme", "address": {"street": "123 Main St", "city": "Boston"}}
/var @test_company = @eq(@company.address.city, "Boston")
/show `Test company city: @test_company`

>> Test numeric field access
/var @data = {"123": "numeric key", "456": {"nested": "value"}}
/var @test_numeric = @eq(@data.123, "numeric key")
/show `Test numeric field: @test_numeric`

>> Test array-like access (if supported)
/var @arr = ["first", "second", "third"]
/var @test_array = @eq(@arr[0], "first")
/show `Test array access: @test_array`

/show `All tests completed!`