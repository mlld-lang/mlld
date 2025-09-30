/exe @func1() = "result1"
/exe @func2() = "result2"
/exe @func3() = "result3"

/var @result = || @func1() || @func2() || @func3()
/show @result