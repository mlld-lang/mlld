# Test command-reference imports and module environment capture

/import { exports } from "command-ref-module-helpers.mld"

# Test direct function calls work
/show `Direct getData: @exports.getData()`
/show `Direct formatData: @exports.formatData(["test", "data"])`

# Test command-reference function that calls siblings
/show `Command-ref processData: @exports.processData()`