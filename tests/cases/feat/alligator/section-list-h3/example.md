# Section List - H3 Only

Test that `# ###??` returns only H3 section headings.

## List H3 headings only

/var @h3s = <section-list-h3-guide.md # ###??>

/show @h3s.join("\n")
