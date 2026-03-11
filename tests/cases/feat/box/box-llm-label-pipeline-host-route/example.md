>> exe llm with pipeline in when branch routes cmd to host shell
>> inside a VFS box. Tests that labels propagate through the
>> when expression's pipe evaluation path.

/exe llm @llm-pipe-route(input) = when [
  * => @input | cmd { node -e "process.stdout.write('pipe-host')" }
]

/var @result = box [
  file "llm-pipe-route-data.txt" = "placeholder"
  let @r = @llm-pipe-route("test")
  => @r
]

/show @result
