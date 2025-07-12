# Alligator URL Markdown Conversion Test

This test verifies URL content conversion features.

## Load an HTML page

/var @html_page = <https://example.com>

## Access different content formats

### Raw HTML
/show `Has HTML: @{typeof @html_page.html !== 'undefined'}`

### Plain text (HTML stripped)
/show `Has text: @{typeof @html_page.text !== 'undefined'}`

### Markdown conversion
/show `Has md: @{typeof @html_page.md !== 'undefined'}`

## Show conversions if available

/when @html_page.text => /show "Text version (first 100 chars):"
/when @html_page.text => /show `@{@html_page.text.substring(0, 100)}...`

/when @html_page.md => /show "Markdown version available"

## Load a markdown URL directly

/var @md_page = <https://raw.githubusercontent.com/example/repo/main/README.md>

### Markdown files should not have HTML property
/show `Markdown has no HTML: @{typeof @md_page.html === 'undefined'}`