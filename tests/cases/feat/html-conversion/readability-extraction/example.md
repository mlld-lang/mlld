# Readability Extraction Test

This test verifies that Readability properly extracts article content while removing navigation, ads, sidebars, and other clutter.

## Load cluttered HTML page
/var @article = <cluttered.html>

## Show extracted article content
/show @article

## Verify metadata extraction
/show `
Metadata:
- Title: @article.mx.title`
