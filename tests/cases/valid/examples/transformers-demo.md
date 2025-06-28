# Transformer and Return Value Demo

This example demonstrates the new capabilities in mlld 1.4.1+ with return values and built-in transformers.

## HTTP Module with Native Return Values

```mlld-run
/import { data, display } from @mlld/http

# Get data as a native object
/var @user = @data.get("https://api.github.com/users/github")

# Access properties directly
/show ::Organization: {{user.name}}::
/show ::Public repos: {{user.public_repos}}::
/show ::Created: {{user.created_at}}::
```

## Array Module with Native Values

```mlld-run
/import { filter, sum, avg, includes, pluck } from @mlld/array

/var @items = [
  {"name": "apple", "price": 1.50, "category": "fruit"},
  {"name": "banana", "price": 0.75, "category": "fruit"},
  {"name": "carrot", "price": 2.00, "category": "vegetable"}
]

# Returns actual array
/var @fruits = @filter(@items, "category", "fruit")

# Returns actual number
/var @totalPrice = @sum(@items, "price")
/var @avgPrice = @avg(@items, "price")

# Returns actual boolean
/var @hasBanana = @includes(@pluck(@items, "name"), "banana")

/show ::Fruits: {{fruits}}::
/show ::Total price: ${{totalPrice}}::
/show ::Average price: ${{avgPrice}}::
/show ::Has banana: {{hasBanana}}::
```

## Using Built-in Transformers

```mlld-run
# JSON transformer for pretty printing
/var @userJson = run {echo '{"name":"test","items":[1,2,3}}'] with {
  pipeline: [@JSON(@input)]
}
/show ::Formatted JSON:::
/show @userJson

# CSV transformer
/var @csvData = run {echo 'name,price\napple,1.50\nbanana,0.75'} with {
  pipeline: [@CSV(@input)]
}
/show ::CSV as array:::
/show ::{{csvData}}::

# XML transformer
/var @xmlData = run {echo '<root><item>test</item></root>'} with {
  pipeline: [@XML(@input)]
}
/show ::XML as object:::
/show ::{{xmlData}}::

# Markdown transformer
/var @mdData = run {echo '# Title\n\nSome **bold** text'} with {
  pipeline: [@MD(@input)]
}
/show ::Markdown AST:::
/show ::{{mdData}}::
```

## Pipeline Transformations

```mlld-run
/import { fixRelativeLinks } from @mlld/fix-relative-links

# Chain transformers together
/var @processedDoc = run {cat README.md} with {
  pipeline: [
    @fixRelativeLinks(@input, ".", "docs"),
    @MD(@input)  # Parse to AST
  ]
}

# Work with the parsed structure
/show ::Document has {{processedDoc.children.length}} top-level elements::
```

## Conditional Logic with Return Values

```mlld-run
/import { includes } from @mlld/array

/var @languages = ["javascript", "python", "rust"]

# Boolean return value works directly with @when
/when @includes(@languages, "python") => @add ::Python is supported!::

# Numeric comparisons
/var @scores = [85, 92, 78, 95, 88]
/var @average = @avg(@scores)

/when @average all: [
  @average > 80 => @add ::Good average score!::,
  @average < 100 => @add ::Room for improvement::
]
```