# Guard After Deny Unhandled

/guard after @blockOutput for op:exe = when [
  @output.includes("secret") => deny "Output contains secret"
]

/exe @emit(value) = js { return value; }

/show @emit("secret-value")
