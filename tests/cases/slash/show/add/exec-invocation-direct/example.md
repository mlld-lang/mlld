/exe @getGreeting = cmd {echo "Hello, World!"}
/exe @getUserInfo(name) = cmd {echo "{\"name\":\"@name\",\"role\":\"developer\"}"}

/show @getGreeting()
/show @getUserInfo("Alice")