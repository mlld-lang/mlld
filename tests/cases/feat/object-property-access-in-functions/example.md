# Object Property Access in Function Arguments

This test verifies that object property access works correctly when passing values to functions.

>> Test object property access in different contexts
/var @user = {"name": "Alice", "age": 30, "active": true}

>> This works fine (already verified):
/show `User name: @user.name`
/show `User age: @user.age`

>> Test nested objects
/var @company = {"name": "Acme", "address": {"street": "123 Main St", "city": "Boston"}}
/show `Company city: @company.address.city`

>> Test numeric field access
/var @data = {"123": "numeric key", "456": {"nested": "value"}}
/show `Numeric field: @data.123`

>> Test object property access in function arguments
/exe @identity(@val) = run {echo "@val"}

>> These should now work correctly with property access
/run @identity(@user.name)
/run @identity(@user.age)
/run @identity(@company.address.city)
/run @identity(@data.123)

>> Summary
/show `All property access tests completed!`