>> Test nested field access on string values without wrapper accessors
>> Note: With pipes, there's a bug where parent object is sent instead (see issue #506)
/var @data = [{"name":"Alice","code":"function test() {}"},{"name":"Bob","code":"function demo() {}"}]
/var @code = @data.0.code
/show @code
