/files <@workspace/> = [{ "task.md": "cmd-workspace" }]

/exe @read(ws) = cmd:@ws { cat @root/task.md }
/show @read(@workspace)
