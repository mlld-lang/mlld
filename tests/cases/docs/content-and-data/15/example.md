/var @page = <https://example.com/data.json>

>> URL-specific metadata
/show @page.ctx.url                      >> Full URL
/show @page.ctx.domain                   >> "example.com"
/show @page.ctx.status                   >> HTTP status code
/show @page.ctx.title                    >> Page title (if HTML)

>> HTML is converted to markdown
/show @page.content                      >> Markdown version
/show @page.ctx.html                     >> Original HTML