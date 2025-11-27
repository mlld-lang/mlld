/run cmd {echo "Hello World"}
/run cmd {ls -la}
/run @data | { cat | jq '.[]' }       << stdin pipe sugar
/run cmd { cat | jq '.[]' } with { stdin: @data }  << explicit stdin