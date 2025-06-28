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

##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##
127.0.0.1	localhost
255.255.255.255	broadcasthost
::1             localhost
## Path with spaces needs quotes

[
  "path with spaces.txt"
]
## Multiple items always array (with quotes)

[
  "array-path-disambiguation-test.md",
  "array-path-disambiguation-section.md"
]
## Comma makes it array

[
  {
    "single": "object"
  }
]
## Section extraction syntax

## section-name

This is the content of section-name that will be extracted.