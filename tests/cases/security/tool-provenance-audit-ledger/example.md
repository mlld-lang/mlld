/exe @fetch(item) = `fetch:@item`
/exe @verify(value) = `verify:@value`

/var @fetched = @fetch("item-1")
/var @verified = @verify(@fetched)
/var @audit = <@root/.mlld/sec/audit.jsonl>
/var @fetchedHasOneTool = @fetched.mx.tools.length() == 1
/var @verifiedHasTwoTools = @verified.mx.tools.length() == 2
/var @firstVerifiedTool = @verified.mx.tools[0].name == "fetch"
/var @secondVerifiedTool = @verified.mx.tools[1].name == "verify"
/var @auditHasIds = @audit[0].id.isDefined() && @audit[1].id.isDefined()
/var @auditTracksTools = @audit[0].event == "toolCall" && @audit[1].event == "toolCall" && @audit[0].tool == "fetch" && @audit[1].tool == "verify"

/show @fetchedHasOneTool
/show @verifiedHasTwoTools
/show @firstVerifiedTool
/show @secondVerifiedTool
/show @auditHasIds
/show @auditTracksTools
