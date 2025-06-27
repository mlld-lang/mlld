# Test exec invocation in data directive

/exe @getValue() = {echo "42"}
/exe @getJSON() = {echo '{"status": "ok", "value": 123}'}
/exe @withParam(key) = {echo "{\"key\": \"$key\", \"timestamp\": 1234567890}"}

## Direct exec in data
/var @numValue = @getValue()
/show ::Number value: {{numValue}}::

## JSON result
/var @jsonResult = @getJSON()
/show ::Status: {{jsonResult.status}}, Value: {{jsonResult.value}}::

## With parameter
/var @paramResult = @withParam("test-key")
/show ::Key: {{paramResult.key}}, Timestamp: {{paramResult.timestamp}}::