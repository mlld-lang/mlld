# Alligator URL Metadata Test

This test verifies that URLs loaded with alligator syntax include rich metadata.

## Load a URL

/var @page = <https://example.com>.keep

## Access URL metadata

/show `URL: @page.mx.url`
/show `Domain: @page.mx.domain`
/show `Status: @page.mx.status`

## Show title if available

/show `Title: @page.mx.title`

## Default content behavior

/show @page
