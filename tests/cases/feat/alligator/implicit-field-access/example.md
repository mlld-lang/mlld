# Implicit Placeholder Field Access

This test demonstrates the new implicit placeholder field access syntax where `.field` is shorthand for `<>.field` in templates.

## Basic Backtick Template

Using `.filename` without explicit `<>`:

/var @filename = `.filename`
/show @filename

## With Chained Fields

Accessing multiple fields:

/var @fields = `.filename.test`
/show @fields

## In Double Quotes

The implicit syntax also works in double quotes:

/var @quoted = ".filename"
/show @quoted

## In Double Colon Templates

And in double-colon templates:

/var @doubleColon = ::.filename::
/show @doubleColon

## In Alligator As Clauses (Double Quotes)

The most important use case - renaming sections with field access:

/var @renamed = <test-file.md # section1> as "### .fm.title"
/show @renamed

## In Alligator As Clauses (Backticks)

With backtick templates:

/var @backtickAs = <test-file.md # section2> as `### .fm.title v.fm.version`
/show @backtickAs

## In Alligator As Clauses (Double Colon)

With double-colon templates:

/var @colonAs = <test-file.md # section1> as ::.fm.title::
/show @colonAs

## With Pipes

Field access with transformations:

/var @withPipe = `.filename|@upper`
/show @withPipe

## Mixed Text and Field Access

Ensure that text followed by `.` doesn't trigger field access:

/var @mixed = "test.filename"
/show @mixed
