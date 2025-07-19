# Alligator URL Metadata Test

This test verifies that URLs loaded with alligator syntax include rich metadata.

## Load a URL

/var @page = <https://example.com>

## Access URL metadata

/show `URL: @page.url`
/show `Domain: @page.domain`
/show `Status: @page.status`
/show `Content Type: @page.contentType`

## Show title if available

/when @page.title => /show `Title: @page.title`

## Default content behavior

/show @page