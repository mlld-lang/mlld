# @output File Tests

This tests outputting variables to files with format detection.

/var @markdown = "# Hello\n\nThis is markdown content."
/var @jsonData = { "key": "value", "items": [1, 2, 3] }
/var @htmlContent = "<h1>Hello</h1><p>HTML content</p>"

/output @markdown to "./output.md"
/output @jsonData to "./data.json"
/output @htmlContent to "./page.html"
/output @jsonData to "./config.yaml" as yaml
/output @markdown to "./content.txt" as text