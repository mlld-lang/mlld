# Alligator Section Names with "as" Substring

Test that section names containing "as" are properly parsed.
The grammar should only treat " as " (space-as-space) as the rename keyword,
not reject section names that happen to contain "as".

## Extract sections with "as" in the name

/show <sections.md # Gotchas>

/show <sections.md # Installation>

/show <sections.md # Basic Usage>
