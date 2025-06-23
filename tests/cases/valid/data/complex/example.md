/var @results = {
greeting: @run {echo "Hello from embedded command"},
value: 42
}
/show @results.greeting