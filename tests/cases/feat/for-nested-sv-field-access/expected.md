# Test: Nested StructuredValue field access in for loop

When a StructuredValue (loaded JSON) is nested inside an object and iterated,
field access should still work - even when the StructuredValue Symbol is lost.

## Direct access works
Direct topic: test-topic
## Wrapped in object - direct access works

Wrapped direct: test-topic
## Wrapped in object inside for loop

In loop name: item1
In loop sv.topic: test-topic
In loop nested: active
Let var topic: test-topic
