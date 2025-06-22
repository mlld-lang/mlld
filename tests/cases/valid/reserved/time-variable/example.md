# @TIME Reserved Variable Test

This tests the @TIME reserved variable.

Current timestamp: 
/add @TIME

/text @logEntry = [[Log entry at {{TIME}}: System check completed]]
/add @logEntry

/run {echo "Script executed at @TIME"}