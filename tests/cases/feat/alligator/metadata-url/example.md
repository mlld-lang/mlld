# Alligator URL Metadata Test

This test verifies that URLs loaded with alligator syntax include rich metadata.

## Load a URL

/var @page = <https://example.com>.keep

## Access URL metadata

/show `URL: @page.ctx.url`
/show `Domain: @page.ctx.domain`
/show `Status: @page.ctx.status`

## Show title if available

/show `Title: @page.ctx.title`

## Default content behavior

/show @page
