# Guard After Deny Handled

/guard after @blockOutput for op:exe = when [
  @output.includes("fail") => deny "Output rejected"
]

/exe @emit(value) = when [
  denied => `Handled after-guard: @ctx.guard.reason`
  * => `Emitted: @value`
]

/show @emit("fail-case")
