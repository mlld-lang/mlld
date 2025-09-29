/exe @func1() = "1"
/exe @func2() = "2"
/exe @func3() = "3"
/exe @func4() = "4"

/var @result = || @func1() || @func2() || @func3() || @func4() (2, 5ms)
/show @result