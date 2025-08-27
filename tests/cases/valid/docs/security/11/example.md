/exe @safeRun(cmd, args) = when [
  @cmd == "ls" || @cmd == "cat" || @cmd == "grep" || @cmd == "echo" => run {@cmd @args}
  * => "Error: command not allowed"
]