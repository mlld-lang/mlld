# Test: Exec Function with Stdin Object

>> Tests that exec functions using stdin properly handle objects

/exe @process(data) = run { cat } with { stdin: @data }

/var @user = {"name": "Charlie", "score": 95}
/show @process(@user)
