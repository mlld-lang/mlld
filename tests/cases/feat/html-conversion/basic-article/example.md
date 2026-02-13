# Basic HTML Article Extraction Test

This test verifies that HTML content is properly converted to Markdown using Readability and Turndown.

## Load HTML file and display as Markdown
/var @article = <article.html>
/show @article

## Access metadata
/show `Title: @article.mx.title`
/show `Description: @article.mx.description`
