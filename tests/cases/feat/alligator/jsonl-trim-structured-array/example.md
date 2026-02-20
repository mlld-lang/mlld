# Structured .trim() parity for JSON and JSONL loads

/var @jsonSource = `{"name":"demo"}`
/output @jsonSource to "trim-structured-single.json"

/var @firstRecord = { "id": 1 }
/var @secondRecord = { "id": 2 }
/append @firstRecord to "trim-structured-lines.jsonl"
/append @secondRecord to "trim-structured-lines.jsonl"

/var @json = <trim-structured-single.json>
/var @jsonl = <trim-structured-lines.jsonl>
/var @jsonTrimmed = @json.trim()
/var @jsonlTrimmed = @jsonl.trim()

/show @jsonTrimmed.startsWith("{")
/show @jsonlTrimmed.startsWith("{")
/show @jsonlTrimmed.split("\n").length
