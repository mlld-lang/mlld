/exec @getGreeting = {echo "Hello, World!"}
/exec @getUserInfo(name) = {echo "{\"name\":\"@name\",\"role\":\"developer\"}"}

/add @getGreeting()
/add @getUserInfo("Alice")