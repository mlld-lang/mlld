@exec getGreeting = @run [(echo "Hello, World!")]
@exec getUserInfo(name) = @run [(echo "{\"name\":\"@name\",\"role\":\"developer\"}")]

@add @getGreeting()
@add @getUserInfo("Alice")