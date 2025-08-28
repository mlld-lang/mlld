# Pipeline Inline Show Test

Inline pipeline show should append to the document.

/var @a = "textA" | show
/var @b = "textB" | show "X: @ctx.try"

