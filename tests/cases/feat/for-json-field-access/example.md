# Test: JSON fields are accessible when iterating over loaded files

/var @files = <for-json-test-*.json>

## Direct access should work
/var @first = @files[0]
/show `Direct access: @first.status`

## For-loop access to JSON fields should work
/var @statuses = for @f in @files => @f.status
/show `For-loop statuses: @statuses`

## Filter by JSON field should work
/var @failed = for @f in @files when @f.status == "fail" => @f.count
/show `Failed counts: @failed`
