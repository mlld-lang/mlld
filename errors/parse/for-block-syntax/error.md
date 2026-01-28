Block syntax '{ }' not supported in for loop actions. 

For loops expect a single expression after '=>'. To perform multiple operations, define an exe function:

exe @processItem(${LOOP_VAR}) = ...your logic...
var @results = for @${LOOP_VAR} in @items => @processItem(@${LOOP_VAR})