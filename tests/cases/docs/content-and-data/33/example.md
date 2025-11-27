>> Files
/var @config = <settings.json>
@config.json              >> Parsed JSON object
@config.data              >> Alias for .json
@config.content           >> Raw string
@config.text              >> Alias for .content

>> Variables
/var @str = '{"status": "ok"}'
@str.data                 >> Parsed JSON object
@str.json                 >> Alias for .data
@str.text                 >> Original string
@str.content              >> Alias for .text
@str                      >> Original string (default)

>> Command output
/var @result = run {curl api.com/data}
@result.data              >> Parse as JSON
@result.json              >> Alias for .data
@result.text              >> Keep as string
@result.content           >> Alias for .text