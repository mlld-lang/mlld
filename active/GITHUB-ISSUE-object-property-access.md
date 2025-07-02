# [v2] Object property access fails in function arguments but works in /show directives

## Description
Object property access using dot notation (`@variable.property`) works inconsistently across different contexts in mlld v2. While it functions correctly in `/show` directives, it fails with "Variable not found" errors when used as arguments to functions.

## Steps to Reproduce

Create a test file with the following content:

```mlld
/import { eq, ok } from @local/test

>> Test object property access in different contexts
/var @user = {"name": "Alice", "age": 30, "active": true}

>> This works fine:
/show `User name: @user.name`
/show `User age: @user.age`
/show `Nested: @company.address.street`

>> This fails with "Variable not found: user.name"
/var @test_name = @eq(@user.name, "Alice")
/var @test_age = @eq(@user.age, 30) 
/var @test_active = @ok(@user.active)

>> Also test nested objects
/var @company = {"name": "Acme", "address": {"street": "123 Main St", "city": "Boston"}}
/var @test_company = @eq(@company.address.city, "Boston")  >> Also fails
```

## Expected Behavior
Object property access should work consistently in all contexts where variable references are allowed:
- ✅ `/show` directives (already working)
- ❌ Function arguments
- ❌ `/var` assignments that use the property value
- ❌ `/when` conditionals (needs testing)
- ❌ `/exe` function bodies (needs testing)

The parser should resolve `@object.property` to the actual value before passing it to functions, just as it does for `/show` directives.

## Actual Behavior
1. In `/show` directives: Works perfectly
   ```
   /show `User name: @user.name`  
   Output: User name: Alice
   ```

2. In function arguments: Fails
   ```
   /var @test = @eq(@user.name, "Alice")
   Error: Variable not found: user.name
   ```

The error suggests the parser is looking for a variable literally named "user.name" instead of accessing the "name" property of the "user" object.

## Error Details
```
There was an error running test-object-in-functions.mld

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ mlld error ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✘  Error: Variable not found: user.name

/var test_name .................................. test-object-in-functions.mld:5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Impact
This limitation significantly affects:

1. **Testing**: Cannot write natural test assertions for object properties
   - Forces awkward workarounds or testing entire objects
   - Makes test output less clear about what actually failed

2. **Data Processing**: Cannot easily work with structured data
   - Common patterns like filtering by object properties require workarounds
   - Makes mlld less suitable for data transformation tasks

3. **Module Functions**: Limits what native modules can do
   - Functions like `@filter(@users, @user.active)` would be natural but don't work
   - Forces users to write JS wrapper functions for simple property access

## Current Workaround
Users must extract properties using JavaScript functions:

```mlld
>> Instead of this natural syntax:
/var @test_name = @eq(@user.name, "Alice")

>> Must do this:
/exe @getName(@obj) = js { return obj.name }
/var @name = @getName(@user)
/var @test_name = @eq(@name, "Alice")

>> Or test the entire object:
/var @test_object = @deepEq(@user, {"name": "Alice", "age": 30, "active": true})
```

## Test Cases
The following test cases should all pass when this issue is fixed:

```mlld
/import { eq, ok, deepEq } from @local/test

>> Simple property access
/var @obj = {"a": 1, "b": 2}
/var @test_prop_a = @eq(@obj.a, 1)
/var @test_prop_b = @eq(@obj.b, 2)

>> Nested property access  
/var @nested = {"x": {"y": {"z": 42}}}
/var @test_nested = @eq(@nested.x.y.z, 42)

>> Array element access (if supported)
/var @arr = [1, 2, 3]
/var @test_array = @eq(@arr.0, 1)  >> or @arr[0] syntax

>> Property access in different contexts
/when @user.active => /show "User is active"
/var @names = @map(@users, @user.name)  >> Should work with array of objects
```

## Additional Context
- Using mlld-v2 command
- Tested in `/Users/adam/dev/mlld/modules/llm/tests/`
- Object property access is a fundamental feature for working with structured data
- This works in v1 mlld (needs verification)

## Labels
- `v2`
- `bug`
- `parser`
- `high-priority`