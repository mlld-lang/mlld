# Guard Before After Compose

/guard before @prep for op:exe = when [
  * => allow @prefixWith("before", @input)
]

/guard after @wrap for op:exe = when [
  * => allow @prefixWith("after", @output)
]

/exe @prefixWith(label, value) = js { return `${label}:${value}`; }

/exe @emit(value) = js { return value; }

/show @emit("base")
