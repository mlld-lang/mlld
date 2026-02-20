# Builtin Transformers

Test that builtin transformers work without needing to define them.

## @upper - Convert to uppercase
/var @text = "hello world"
/var @upper_result = @text | @upper
/show @upper_result

## @lower - Convert to lowercase
/var @mixed = "Hello WORLD"
/var @lower_result = @mixed | @lower
/show @lower_result

## @trim - Remove whitespace
/var @padded = "  hello  "
/var @trim_result = @padded | @trim
/show "'@trim_result'"

## @pretty - Pretty print JSON
/var @compact = '{"a":1,"b":2}'
/var @pretty_result = @compact | @pretty
/show @pretty_result

## @sort - Sort array
/var @unsorted = "[3,1,2]"
/var @sorted_result = @unsorted | @json | @sort
/show @sorted_result
