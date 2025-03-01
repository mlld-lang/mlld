# Specific Test Cases

This directory contains test cases designed to highlight specific differences between meld-ast 3.0.1 and 3.3.0.

## array-notation-simple

Tests simple array access notation

```meld

@data fruits = ["apple", "banana", "cherry"]

Bracket notation: {{fruits[0]}}, {{fruits[1]}}, {{fruits[2]}}

```

## array-notation-nested

Tests nested array access notation

```meld

@data users = [
  { name: "Alice", hobbies: ["reading", "hiking"] },
  { name: "Bob", hobbies: ["gaming", "cooking"] }
]

User 1: {{users[0].name}} - {{users[0].hobbies[0]}}
User 2: {{users[1].name}} - {{users[1].hobbies[1]}}

```

## array-variable-index

Tests array access with variable index

```meld

@data fruits = ["apple", "banana", "cherry"]
@data index = 1

Using variable index: {{fruits[index]}}

```

