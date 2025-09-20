# Command Reference Array Preservation Test

This test verifies that command-reference executables preserve array types when passing them as arguments to other executables.

## Setup functions

/exe @getArray() = js {
  return ["apple", "banana", "cherry"];
}

/exe @joinArray(items) = js {
  // This should receive an actual array, not a stringified version
  if (Array.isArray(items)) {
    return "Array received: " + items.join(", ");
  } else {
    return "Error: Expected array but got " + typeof items;
  }
}

## Test 1: Direct call (baseline - this works)

/var @directResult = @joinArray(@getArray())
/show `Direct: @directResult`

## Test 2: Command-ref (this is the bug we're fixing)

/exe @cmdRefJoin() = @joinArray(@getArray())
/var @cmdRefResult = @cmdRefJoin()
/show `Command-ref: @cmdRefResult`

## Test 3: Nested command-ref with parameters

/exe @getCustomArray(prefix) = js {
  return [prefix + "1", prefix + "2", prefix + "3"];
}

/exe @cmdRefWithParam(p) = @joinArray(@getCustomArray(@p))
/var @paramResult = @cmdRefWithParam("item")
/show `With param: @paramResult`