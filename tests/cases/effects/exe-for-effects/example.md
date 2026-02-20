# Test effects streaming from exe functions with for loops

This test verifies that effects are emitted immediately when exe functions
contain for loops, not buffered until the for loop completes.

## Basic exe-for function

/exe @show_processing(item) = when [
  * => [
    show "Processing: @item"
    => "Processing: @item"
  ]
]

/exe @process_items(items) = for @item in @items => @show_processing(@item)

/show "Start exe-for test"
/var @result = @process_items(["A", "B", "C"])
/show "End exe-for test"

## Exe-for with pipeline

/exe @step1(x) = when [
  * => [
    show "Step1: @x"
    => "processed-@x"
  ]
]

/exe @step2(x) = when [
  * => [
    show "Step2: @x"
    => "final-@x"
  ]
]

/exe @process_with_pipeline(items) = for @item in @items => @step1(@item) | @step2

/show "Start pipeline test"
/var @pipeline_result = @process_with_pipeline(["X", "Y"])
/show "End pipeline test"

## Results

/for @r in @result => show "Result: @r"
/for @pr in @pipeline_result => show "Pipeline result: @pr"
