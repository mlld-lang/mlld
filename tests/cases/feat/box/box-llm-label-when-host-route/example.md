>> exe llm with when body (wrapped in block) routes cmd to host shell
>> inside a VFS box. Matches the @claude module pattern: block with
>> inner when expression. Tests mlld-exe-block + when label propagation.

/exe llm @llm-when-route(input) = [
  => when [
    * => cmd { node -e "process.stdout.write('when-host')" }
  ]
]

/var @result = box [
  file "llm-when-route-data.txt" = "placeholder"
  let @r = @llm-when-route("test")
  => @r
]

/show @result
