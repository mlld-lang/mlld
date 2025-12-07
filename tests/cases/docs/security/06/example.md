/guard @noUploads before op:run = when [
  @input.any.ctx.taint.includes("dir:/tmp/uploads") => deny "Cannot execute uploads"
  @input.any.ctx.taint.includes("src:exec") => deny "No nesting command output"
  * => allow
]