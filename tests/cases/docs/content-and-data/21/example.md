>> List all section headings
/var @headings = <guide.md # ??>
/show @headings.join("\n")

>> List specific heading levels
/var @h2s = <guide.md # ##??>                  # H2 headings only
/var @h3s = <guide.md # ###??>                 # H3 headings only