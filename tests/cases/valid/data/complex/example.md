/data @results = {
  greeting: @run {echo "Hello from embedded command"},
  value: 42
}
/add @results.greeting