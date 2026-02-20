/exe @getStr() = "hello world"
/exe @checkHello() = @getStr().includes("hello")
/var @result = @checkHello()
/show @result
