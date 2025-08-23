# Pipeline Inline Output to stdout

Inline pipeline output to stdout should not affect the document.

/show "Before"
/var @x = "hello" | output @input to stdout
/show "After"

