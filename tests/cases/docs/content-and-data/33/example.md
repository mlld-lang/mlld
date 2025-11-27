>> Double-colon (default)
/var @msg = ::Hello @name!::
/var @doc = ::Use `npm test` before @env::
/var @report = ::
Status: @status
Config: <@base/config.json>
Data: @data|@json
::

>> Backticks (alternative)
/var @msg = `Hello @name!`
/var @multi = `
Line 1: @var
Line 2: @other
`

>> Double quotes (single-line only)
/var @path = "@base/files/@filename"
/run cmd {echo "Processing @file"}

>> Triple-colon (Discord/social only)
/var @alert = :::Alert <@{{adminId}}>! Issue from <@{{userId}}>:::
/var @tweet = :::Hey @{{user}}, check this! cc: @{{team1}} @{{team2}}:::

>> Single quotes (literal)
/var @literal = '@name stays literal'