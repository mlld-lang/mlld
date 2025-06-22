# Transformer and Return Value Demo

This example demonstrates the new capabilities in mlld 1.4.1+ with return values and built-in transformers.

## HTTP Module with Native Return Values

```mlld-run
/import { data, display } from @mlld/http

# Get data as a native object
/data @user = @data.get("https://api.github.com/users/github")

# Access properties directly
/add [[Organization: {{user.name}}]]
/add [[Public repos: {{user.public_repos}}]]
/add [[Created: {{user.created_at}}]]
```

## Array Module with Native Values

```mlld-run
/import { filter, sum, avg, includes, pluck } from @mlld/array

/data @items = [
  {"name": "apple", "price": 1.50, "category": "fruit"},
  {"name": "banana", "price": 0.75, "category": "fruit"},
  {"name": "carrot", "price": 2.00, "category": "vegetable"}
]

# Returns actual array
/data @fruits = @filter(@items, "category", "fruit")

# Returns actual number
/data @totalPrice = @sum(@items, "price")
/data @avgPrice = @avg(@items, "price")

# Returns actual boolean
/data @hasBanana = @includes(@pluck(@items, "name"), "banana")

/add [[Fruits: {{fruits}}]]
/add [[Total price: ${{totalPrice}}]]
/add [[Average price: ${{avgPrice}}]]
/add [[Has banana: {{hasBanana}}]]
```

## Using Built-in Transformers

```mlld-run
# JSON transformer for pretty printing
/text @userJson = @run {echo '{"name":"test","items":[1,2,3}}'] with {
  pipeline: [@JSON(@input)]
}
/add [[Formatted JSON:]]
/add @userJson

# CSV transformer
/text @csvData = @run {echo 'name,price\napple,1.50\nbanana,0.75'} with {
  pipeline: [@CSV(@input)]
}
/add [[CSV as array:]]
/add [[{{csvData}}]]

# XML transformer
/text @xmlData = @run {echo '<root><item>test</item></root>'} with {
  pipeline: [@XML(@input)]
}
/add [[XML as object:]]
/add [[{{xmlData}}]]

# Markdown transformer
/text @mdData = @run {echo '# Title\n\nSome **bold** text'} with {
  pipeline: [@MD(@input)]
}
/add [[Markdown AST:]]
/add [[{{mdData}}]]
```

## Pipeline Transformations

```mlld-run
/import { fixRelativeLinks } from @mlld/fix-relative-links

# Chain transformers together
/text @processedDoc = @run {cat README.md} with {
  pipeline: [
    @fixRelativeLinks(@input, ".", "docs"),
    @MD(@input)  # Parse to AST
  ]
}

# Work with the parsed structure
/add [[Document has {{processedDoc.children.length}} top-level elements]]
```

## Conditional Logic with Return Values

```mlld-run
/import { includes } from @mlld/array

/data @languages = ["javascript", "python", "rust"]

# Boolean return value works directly with @when
/when @includes(@languages, "python") => @add [[Python is supported!]]

# Numeric comparisons
/data @scores = [85, 92, 78, 95, 88]
/data @average = @avg(@scores)

/when @average all: [
  @average > 80 => @add [[Good average score!]],
  @average < 100 => @add [[Room for improvement]]
]
```