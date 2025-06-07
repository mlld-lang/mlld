@exec get_time() = @run [echo "12:30 PM"]
@exec get_user() = @run [echo "test-user"]
@exec format_greeting(name) = @run [echo "Welcome, {{name}}!"]

Current time: @add @get_time()
User: @add @get_user()
@add @format_greeting("Alice")