# Test: Array of Mixed Primitive Types

>> Arrays with different primitive types should still expand as arguments

/var @mixed_primitives = ["text", 42, true, null]
/run { echo @mixed_primitives }
