# Guard After Transform

/guard after @sanitizeOutput for op:exe = when [
  * => allow @sanitizeValue(@output)
]

/exe @sanitizeValue(value) = js { return `sanitized:${value}`; }

/exe @emit(value) = js { return value; }

/show @emit("raw-output")
