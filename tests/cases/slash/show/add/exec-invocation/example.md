/exe @get_time() = cmd {echo "12:30 PM"}
/exe @get_user() = cmd {echo "test-user"}
/exe @format_greeting(name) = cmd {echo "Welcome, @name!"}

/show `Current time: `
/show @get_time()
/show `User: `
/show @get_user()
/show ``
/show @format_greeting("Alice")