@exec get_time() = [(echo "12:30 PM")]
@exec get_user() = [(echo "test-user")]
@exec format_greeting(name) = [(echo "Welcome, @name!")]

@add [[Current time: ]]
@add @get_time()
@add [[
User: ]]
@add @get_user()
@add [[
]]
@add @format_greeting("Alice")