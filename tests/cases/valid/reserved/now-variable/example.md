# @NOW Reserved Variable Test

This tests the @NOW reserved variable.

Current timestamp: 
/show @NOW

/var @logEntry = `Log entry at @NOW: System check completed`
/show @logEntry

/run {echo "Script executed at @NOW"}