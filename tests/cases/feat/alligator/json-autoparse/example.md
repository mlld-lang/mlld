# Test JSON/JSONL auto-parse in alligator loader

/var @jsonContent = `{"name":"foo","list":[1,2]}`
/output @jsonContent to data.json

/var @jsonVal = <data.json>
/show `json name: @jsonVal.name, first: @jsonVal.list[0]`

/var @jsonlContent = `{"x":1}\n{"x":2}\n`
/output @jsonlContent to data.jsonl

/var @jsonlVal = <data.jsonl>
/show `jsonl length: @jsonlVal.length, second: @jsonlVal[1].x`
