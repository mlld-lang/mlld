# Test @add foreach with template

/data @items = ["apple", "banana", "cherry"]

/exec @describe(item) = {echo "This is a @item"}

## With template formatting

/add foreach @describe(@items) with { template: "- {{result}}" }