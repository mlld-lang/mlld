/var @tools = "json"
/var @model = ""

>> @tools is truthy, so --tools is included
>> @model is falsy (empty string), so --model is omitted
/run cmd { echo @tools?`--tools "@tools"` @model?`--model "@model"` done }
>> Output: --tools "json" done