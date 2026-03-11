>> exe llm with block body routes cmd to host shell inside a VFS box.
>> Without label propagation, the command would route to the VFS
>> ShellSession where "node" is not available.

/exe llm @llm-block-route(input) = [
  let @out = cmd { node -e "process.stdout.write('block-host')" }
  => @out
]

/var @result = box [
  file "llm-block-route-data.txt" = "placeholder"
  let @r = @llm-block-route("test")
  => @r
]

/show @result
