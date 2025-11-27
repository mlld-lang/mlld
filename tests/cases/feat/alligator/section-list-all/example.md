# Section List - All Headings

Test that `# ??` returns all section headings at any level.

## List all section headings

/var @headings = <section-list-all-guide.md # ??>

/show @headings.join("\n")
