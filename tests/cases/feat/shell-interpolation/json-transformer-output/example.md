# Test: JSON Transformer Output to Command

>> Tests that @json transformer output (StructuredValue) works in commands

/var @text = '{"status": "ok", "data": [1,2,3]}'
/var @parsed = @text | @json
/run { echo @parsed }
