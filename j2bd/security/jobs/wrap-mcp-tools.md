# Job: Wrap MCP Tools for Agent Safety

## Scenario

I want to give my agent access to MCP tools (GitHub, Slack, etc.) but ensure mlld is the chokepoint:

1. All tool outputs get tainted automatically (src:mcp)
2. Guards can inspect/block/transform tool calls
3. Policy controls which tools can be called with what data
4. I can see audit trail of tool usage

## Key Atoms Needed

- mcp-import (importing MCP tools into mlld)
- mcp-security (src:mcp auto-taint on outputs)
- mcp-policy (label flow rules for MCP data)
- mcp-guards (before/after guards for tool calls)

## Relevant Spec Sections

- Part 6: MCP Integration
- Part 1: Labels (The Foundation)
- Part 3: Policy (Declarative Controls)
- Part 4: Guards (Expressive Controls)

## Success Criteria

### Phase 1: Documentation

All atoms written with working, validated mlld examples:

- [ ] mcp-import atom - explains `import tools from mcp "..." as @name` syntax
- [ ] mcp-security atom - explains automatic src:mcp tainting on tool outputs
- [ ] mcp-policy atom - explains policy rules for MCP data (what can flow where)
- [ ] mcp-guards atom - explains `guard before op:mcp` and `guard after op:mcp` syntax

Each atom should be 100-200 words with at least one working code example that passes `mlld validate`.

### Phase 2: Implementation

Create working MCP security demonstration:

- [ ] Import MCP tools (use a real or mock MCP server)
- [ ] Show that tool outputs have src:mcp taint automatically
- [ ] Show guard blocking secret data from flowing to MCP tools
- [ ] Show policy restricting which MCP tools are available
- [ ] Show audit trail/logging of MCP tool usage

### Phase 3: Verification & Remediation

- [ ] Run the target example code end-to-end
- [ ] Verify `import tools from mcp` syntax works
- [ ] Verify automatic tainting works (`@result.mx.taint` includes "src:mcp")
- [ ] Verify `guard before op:mcp` triggers on MCP calls
- [ ] Verify secret data is blocked from flowing to MCP tools
- [ ] Identify any gaps in mlld (e.g., MCP integration incomplete, taint not applied)
- [ ] Create friction tickets for gaps; fix or escalate as needed
- [ ] Re-verify after fixes

### Exit Criteria

All phases complete. The target example successfully imports MCP tools, demonstrates automatic tainting, and blocks secrets from flowing to MCP operations.

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
