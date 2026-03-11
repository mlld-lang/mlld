/files <@workspace/> = [{ "task.md": "cmd-workspace" }]

/exe @read(ws) = cmd:@ws { cat task.md }
/show @read(@workspace)
