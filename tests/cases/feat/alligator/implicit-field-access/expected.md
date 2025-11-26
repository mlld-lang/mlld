# Implicit Placeholder Field Access

This test demonstrates the new implicit placeholder field access syntax where `.field` is shorthand for `<>.field` in templates.

## Basic Backtick Template

Using `.filename` without explicit `<>`:


.filename
## With Chained Fields

Accessing multiple fields:


.filename.test
## In Double Quotes

The implicit syntax also works in double quotes:


.filename
## In Double Colon Templates

And in double-colon templates:


.filename
## In Alligator As Clauses (Double Quotes)

The most important use case - renaming sections with field access:


### .fm.title

Content of section 1.
## In Alligator As Clauses (Backticks)

With backtick templates:


### .fm.title v.fm.version

Content of section 2.
## In Alligator As Clauses (Double Colon)

With double-colon templates:


## .fm.title

Content of section 1.
## With Pipes

Field access with transformations:


.filename|@upper
## Mixed Text and Field Access

Ensure that text followed by `.` doesn't trigger field access:


test.filename
