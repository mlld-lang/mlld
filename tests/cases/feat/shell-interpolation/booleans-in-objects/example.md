# Test: Booleans in Objects

>> Ensures boolean values in objects are preserved correctly

/var @flags = {"debug": true, "verbose": false, "test": null}
/run { cat } with { stdin: @flags }
