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

## Direct pipeline in var-for expression

/exe @stage1(x) = when [
  * => show "Stage1: @x"
  * => "s1-@x"
]

/exe @stage2(x) = when [
  * => show "Stage2: @x"
  * => "s2-@x"
]

/exe @stage3(x) = when [
  * => show "Stage3: @x"
  * => "s3-@x"
]

/show "Start direct pipeline test"

>> This is the exact one-line syntax: var + for + direct pipeline
/var @pipelined = for @item in ["P", "Q"] => @stage1(@item) | @stage2 | @stage3

/show "End direct pipeline test"
/for @p in @pipelined => show "Pipeline result: @p"