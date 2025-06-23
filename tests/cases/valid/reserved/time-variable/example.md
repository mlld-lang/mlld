# @TIME Reserved Variable Test

This tests the @TIME reserved variable.

Current timestamp: 
/show @TIME

/var @logEntry = [[Log entry at {{TIME}}: System check completed]]
/show @logEntry

/run {echo "Script executed at @TIME"}