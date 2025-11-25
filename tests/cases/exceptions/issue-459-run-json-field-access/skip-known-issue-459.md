Bug #459: JSON string field access in run command broken

When a JSON string is passed to an /exe function with run { },
multiple field accesses return the whole string instead of individual values.

Workarounds:
- Use object literal: /var @entry = {"a":1,"b":2}
- Use explicit @json: /var @entry = '...' | @json
- Use .data accessor: @display(@entry.data)

https://github.com/mlld-lang/mlld/issues/459
