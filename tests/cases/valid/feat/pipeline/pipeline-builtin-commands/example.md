# Test Pipeline Builtin Commands

Pipeline builtin commands are pass-through stages that perform side effects while returning their input unchanged.

## Define helper functions

/exe @upper(text) = js { return text.toUpperCase(); }
/exe @reverse(text) = js { return text.split('').reverse().join(''); }
/exe @addPrefix(text) = js { return "PREFIX:" + text; }
/exe @process(text) = js { return text + "!"; }

## Test 1: Show passes through

/var @result1 = "hello" | show | @upper
/show @result1

## Test 2: Show with argument

/var @data = "processing"
/var @result2 = @data | show "Debug: " | @upper
/show @result2

## Test 3: Log passes through

/var @result3 = "world" | log | @reverse
/show @result3

## Test 4: Multiple builtins in pipeline

/var @result4 = "test" | show | log "Processing..." | @addPrefix
/show @result4

## Test 5: Output to stdout

/var @result5 = "data" | output | @upper
/show @result5

## Test 6: Builtin with @input reference

/var @jsonData = `{"message": "hi"}`
/var @result6 = @jsonData | show @input | @process
/show @result6