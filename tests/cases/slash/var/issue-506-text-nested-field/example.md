>> Test that .text accessor works on nested field access WITHOUT pipes
>> Note: With pipes, there's a bug where parent object is sent instead (see issue #506)
/var @data = [{"name":"Alice","code":"function test() {}"},{"name":"Bob","code":"function demo() {}"}]
/var @code = @data.0.code.text
/show @code
