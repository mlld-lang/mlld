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

This file has spaces in its name!
## Multiple items always array (with alligators)

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

## section-name

This is the content of section-name that will be extracted.