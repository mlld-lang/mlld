>> Single file - returns plain string array
/var @headings = <guide.md # ??>
/show @headings.join("\n")

>> List specific heading levels
/var @h2s = <guide.md # ##??>                  # H2 headings only
/var @h3s = <guide.md # ###??>                 # H3 headings only

>> Glob patterns - returns per-file structured results
/var @docSections = <docs/**/*.md # ##??>
/for @doc in @docSections => show "**@doc.file**: @doc.names.join(', ')"