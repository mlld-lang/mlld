# Test exec invocation in data directive

/exec @getValue() = {echo "42"}
/exec @getJSON() = {echo '{"status": "ok", "value": 123}'}
/exec @withParam(key) = {echo "{\"key\": \"$key\", \"timestamp\": 1234567890}"}

## Direct exec in data
/data @numValue = @getValue()
/add [[Number value: {{numValue}}]]

## JSON result
/data @jsonResult = @getJSON()
/add [[Status: {{jsonResult.status}}, Value: {{jsonResult.value}}]]

## With parameter
/data @paramResult = @withParam("test-key")
/add [[Key: {{paramResult.key}}, Timestamp: {{paramResult.timestamp}}]]