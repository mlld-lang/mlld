>> Regression test for issue #506
>> Field access with pipes should send the field value, not the parent object
/var @data = [{"name":"Alice","code":"line1\nline2\nline3\nline4"}]
/show @data.0.code | cmd {head -2}
