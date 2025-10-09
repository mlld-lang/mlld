# Test: Array of Objects via Stdin

>> Ensures stdin handles arrays of objects correctly

/var @users = [{"name": "Alice", "role": "admin"}, {"name": "Bob", "role": "user"}]
/run { cat } with { stdin: @users }
