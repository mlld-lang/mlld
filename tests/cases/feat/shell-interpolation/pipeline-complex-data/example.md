# Test: Pipeline with Complex Data

>> Tests that complex data flows correctly through pipelines
>> that use shell command stages

/exe @echo_json(data) = run { echo @data }

/var @nested = [{"group": "A", "items": [1,2]}, {"group": "B", "items": [3,4]}]
/var @result = @nested | @echo_json
/show @result
