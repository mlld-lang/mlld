/exe @getGreeting = {echo "Hello, World!"}
/exe @getUserInfo(name) = {echo "{\"name\":\"@name\",\"role\":\"developer\"}"}

/show @getGreeting()
/show @getUserInfo("Alice")