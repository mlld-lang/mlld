/guard @noUploads before op:run = when [
  @input.any.mx.taint.includes("dir:/tmp/uploads") => deny "Cannot execute uploads"
  @input.any.mx.taint.includes("src:exec") => deny "No nesting command output"
  * => allow
]