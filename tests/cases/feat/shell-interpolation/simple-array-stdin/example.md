# Test: Simple Array via Stdin (Regression Test)

>> Ensures simple arrays via stdin still work as expected
>> Simple arrays use newline separation for stdin

/var @names = ["Alice", "Bob", "Charlie"]
/run { cat } with { stdin: @names }
