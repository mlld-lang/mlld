# HTML Section Extraction Test

This test demonstrates that section extraction works with HTML files just like with markdown files.

## Load a section from an HTML file
/var @intro = <test-article.html # Introduction>

## Show the extracted section
/show @intro

## Load another section
/var @features = <test-article.html # Features>

## Show the features section
/show @features