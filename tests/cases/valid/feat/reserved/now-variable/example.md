# @now Reserved Variable Test

This tests the @now reserved variable.

Current timestamp: 
/show @now

/var @logEntry = `Log entry at @now: System check completed`
/show @logEntry

/run {echo "Script executed at @now"}