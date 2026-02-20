# Per-item JSON parse resilience (m-da33)

/var @files = <glob-json-resilience-*.json>

## Array length preserved

/show `Count: @files.length`

## Valid items parse normally

/var @a = @files[1]
/show `Name A: @a.name`

/var @c = @files[2]
/show `Name C: @c.name`

## Bad item degrades to text with file metadata preserved

/var @bad = @files[0]
/show `Bad type: @bad.mx.type`
/show `Bad filename: @bad.mx.filename`
