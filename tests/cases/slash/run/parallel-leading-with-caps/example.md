/exe @func1() = "1"
/exe @func2() = "2"
/exe @func3() = "3"

/run || @func1() || @func2() || @func3() (2, 10ms)