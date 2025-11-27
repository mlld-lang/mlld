# Section List - H2 Only

Test that `# ##??` returns only H2 section headings.

## List H2 headings only

/var @h2s = <section-list-h2-guide.md # ##??>

/show @h2s.join("\n")
