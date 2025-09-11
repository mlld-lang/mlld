/var @API_KEY = "secret"
/exe @process(input) = `
API Key: @API_KEY
Input: @input
`

/run {echo "data"} | @process  >> @process can see API_KEY