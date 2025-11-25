# Guard After Allow

/guard after @allowOutput for op:exe = when [
  @output == "clean" => allow
]

/exe @emit(value) = js { return value; }

/show @emit("clean")
