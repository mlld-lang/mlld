# Guard After Transform Chain

/guard after @first for op:exe = when [
  * => allow @addStep(@output, "step1")
]

/guard after @second for op:exe = when [
  @output.startsWith("step1:") => allow @addStep(@output, "step2")
  * => deny "transform chain broken"
]

/exe @addStep(value, tag) = js { return `${tag}:${value}`; }

/exe @emit(value) = js { return value; }

/show @emit("base")
