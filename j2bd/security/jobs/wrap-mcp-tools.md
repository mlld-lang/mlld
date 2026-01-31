# Job: Wrap MCP Tools for Agent Safety

## Scenario

I want to give my agent access to MCP tools (GitHub, Slack, etc.) but ensure mlld is the chokepoint:

1. All tool outputs get tainted automatically (src:mcp)
2. Guards can inspect/block/transform tool calls
3. Policy controls which tools can be called with what data
4. I can see audit trail of tool usage

## Success Criteria

- Working mlld code that imports MCP tools
- Demonstrates automatic taint on tool outputs
- Shows guard blocking tool call with tainted input
- Shows policy restricting which tools are available

## Key Atoms Needed

- mcp-import
- mcp-security (src:mcp auto-taint)
- mcp-policy (label flow rules for src:mcp)
- mcp-guards (before/after tool calls)

## Example Code (Target)

```mlld
import tools from mcp "@github/issues" as @github

var @issues = @github.listIssues({ repo: "myrepo" })
>> @issues now has src:mcp taint automatically

show @issues.mx.taint  >> ["src:mcp"]

guard before op:mcp = when [
  @input.any.mx.taint.includes("secret") => deny "No secrets to MCP tools"
  * => allow
]

var secret @token = "sk-12345"

>> This is blocked - secret data can't flow to MCP tools
@github.createComment({ issue: 1, body: @token })
```
