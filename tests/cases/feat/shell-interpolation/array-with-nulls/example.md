# Test: Array with Null Values

>> Nulls are primitives, so array should be treated as simple

/var @sparse = [null, "text", null, "more"]
/run { echo @sparse }
