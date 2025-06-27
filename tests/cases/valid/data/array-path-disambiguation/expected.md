# Array vs Path Disambiguation Tests

## Single object is array
[
  {
    "type": "test"
  }
]

## Single exec invocation is array  
[
  "12:00"
]

## Single nested array is array
[
  [
    1,
    2,
    3
  ]
]

## Single string is path
This is the content of array-path-disambiguation-test.md file.

## Absolute path is path
First 30 chars: ##
# Host Database
#
# localhos

## Path with spaces needs quotes
[
  "path with spaces.txt"
]

## Multiple items always array
[
  "This is the content of array-path-disambiguation-test.md file.",
  "# Section Test File\n\nSome intro content.\n\n## section-name\n\nThis is the content of section-name that will be extracted.\n\n## another-section\n\nThis section should not be included."
]

## Comma makes it array
[
  {
    "single": "object"
  }
]

## Section extraction syntax
This is the content of section-name that will be extracted.