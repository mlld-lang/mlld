>> Spaced pipeline for <file> after alligator
/exe @upper(text) = js { return String(text).toUpperCase(); }
/var @data = <test-pipeline-data.json> | @upper
/show @data

