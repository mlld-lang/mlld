# Test @add foreach with template

/var @items = ["apple", "banana", "cherry"]

/exe @describe(item) = {echo "This is a @item"}

## With template formatting

/show foreach @describe(@items) with { template: "- {{result}}" }