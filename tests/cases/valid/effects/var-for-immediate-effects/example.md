# Test that effects stream immediately in /var for loops

This test verifies that effects are emitted immediately during for loop
execution within /var assignments, not buffered until completion.

## Simple for loop in var assignment

/exe @process(item) = when [
  * => show "Processing: @item"
  * => "result-@item"
]

/show "Start var-for test"

/var @results = for @i in [1, 2, 3] => @process(@i)

/show "End var-for test"
/show "Results: @results"

## For loop with side effects

/exe @counter() = js {
  if (!global.testCounter) global.testCounter = 0;
  return ++global.testCounter;
}

/exe @track(item) = when [
  * => show "Item @item at position @counter()"
  * => @item
]

/show "Start tracking test"

/var @tracked = for @x in ["A", "B", "C"] => @track(@x)

/show "End tracking test"