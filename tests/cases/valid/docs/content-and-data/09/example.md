/var @page = <https://example.com/data.json>

>> URL-specific metadata
/show @page.url                          >> Full URL
/show @page.domain                       >> "example.com"
/show @page.status                       >> HTTP status code
/show @page.title                        >> Page title (if HTML)

>> HTML is converted to markdown
/show @page.content                      >> Markdown version
/show @page.html                         >> Original HTML