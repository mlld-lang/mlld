/run {echo "Hello World"}
/run {ls -la}
/run @data | { cat | jq '.[]' }       << stdin pipe sugar
/run { cat | jq '.[]' } with { stdin: @data }  << explicit stdin