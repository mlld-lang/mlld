# Alligator Section Extraction Test

This test verifies that section extraction returns plain strings for backward compatibility.

## Extract a section

/var @install = <guide.md # Installation>

## Show the section content

/show @install

## It should be a plain string, not an object

/show `Type check: @install`