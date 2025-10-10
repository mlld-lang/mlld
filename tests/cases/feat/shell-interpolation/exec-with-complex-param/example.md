# Test: Exec Function with Complex Parameter

>> Tests that parameters containing complex data are properly handled
>> when passed to executable functions that use shell commands

/exe @echo_data(data) = run { echo @data }

/var @nested = [["a", "b"], ["c", "d"]]
/var @result = @echo_data(@nested)
/show @result
