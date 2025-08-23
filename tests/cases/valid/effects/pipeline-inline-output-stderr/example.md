# Pipeline Inline Output to stderr

Inline pipeline output to stderr should not affect the document.

/show "Head"
/var @x = "oops" | output @input to stderr
/show "Tail"

