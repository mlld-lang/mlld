>> Format JSON with indentation
/var @data = <file.csv>
/var @tojson = @data | @json
/show @tojson

>> Convert to XML (SCREAMING_SNAKE_CASE)
/var @toxml = @data | @XML
/show @toxml

>> Convert arrays to CSV
/var @users = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
/var @tocsv = @users | @CSV
/show @tocsv

`@json` accepts loose JSON syntax (single quotes, trailing commas, comments). Use `@json.loose` when you want to be explicit, or `@json.strict` to require standard JSON and surface a clear error if the input is relaxed:
