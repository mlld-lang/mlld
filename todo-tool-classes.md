# Tool Classification for mlld

## What Is Tool Classification?

Tool classification is structured metadata about the security-relevant properties of tool inputs and outputs — separate from the tool's functional schema (parameter types, return types).

A tool schema says: `send_email(to: string, subject: string, body: string) → { sent: bool, messageId: string }`

Classification says:
- `send_email` is a **write** operation, **destructive** (can't unsend)
- `to` is a **control argument** (determines who is affected)
- `subject` and `body` are **data arguments** (carry content)
- `messageId` in the return is **authoritative** (system-generated, safe for authorization)
- `sent` is **informational** (not useful for authorization decisions)

## Why It Matters

The core agent security problem: an LLM decides which tools to call and what arguments to pass. If an attacker injects instructions via data (email body, file contents, API response), the LLM might:

1. Call dangerous tools it shouldn't
2. Pass attacker-controlled values as control arguments (send email to attacker's address)
3. Trust return values that contain attacker content

Classification metadata lets the runtime and policy system reason about these risks structurally rather than ad hoc.

## The Two Sides

### Input-side: Control Args vs Data Args

**Control arguments** determine the *target* or *effect* of an operation:
- `send_email.to` — who receives it
- `delete_file.path` — what gets deleted
- `transfer_money.account` — where money goes
- `create_issue.repository` — which repo is affected

**Data arguments** carry *content* without controlling the operation's target:
- `send_email.body` — email content
- `create_file.content` — file contents
- `create_issue.description` — issue text

The security distinction: if an attacker controls a data arg, they can inject misleading content. If an attacker controls a control arg, they can redirect the operation entirely (send secrets to their email, delete critical files, etc).

### Output-side: Promoted Fields

**Promoted fields** are return values that are authoritative enough for use in authorization decisions:
- `search_contacts.email` — authoritative (came from the contacts database)
- `create_file.id` — authoritative (system-generated)
- `search_emails.body` — NOT authoritative (attacker-controlled content)
- `list_files.filename` — authoritative (filesystem metadata)
- `list_files.content` — NOT authoritative (file contents could be attacker-written)

This is the concept from spec-data-layer.md Section 5.4-5.5.

## Prior Art and References

### AgentDojo (ETH Zurich / Invariant Labs)
- Paper: "AgentDojo: A Dynamic Environment to Evaluate Attacks and Defenses for LLM Agents" (2024)
- https://github.com/ethz-spylab/agentdojo
- Defines benchmark tasks where agents must use tools correctly despite injection attacks
- Their threat model distinguishes "important" args (control) from "less important" args (data)
- Key insight: many attacks succeed by manipulating control args, not just by getting the LLM to call dangerous tools

### Invariant Guardrails
- https://github.com/invariantlabs-ai/invariant
- Policy language for agent tool use that can express constraints like "the `to` field of `send_email` must match a value from `search_contacts`"
- Their `check_tool_calls` function inspects tool call traces and validates argument provenance
- Relevant pattern: they treat tool call traces as structured data and write rules over them

### Google DeepMind — Agent Safety
- "Practices for Governing Agentic AI Systems" (2023) and related work
- Discusses "action classification" — categorizing tool actions by risk level and reversibility
- Distinguishes: read-only, reversible write, irreversible write, external communication
- Relevant for the risk dimension of classification

### Anthropic — Tool Use Best Practices
- Anthropic's documentation on tool use recommends marking tools as "sensitive" and requiring human confirmation
- The "computer use" work introduces the concept of tool risk levels
- Relevant: even without formal classification schemas, the pattern of annotating tools with risk metadata is standard practice

### OpenAI Function Calling — Implicit Classification
- OpenAI's agent framework doesn't have formal classification, but their "Swarm" and agent examples use naming conventions and docstrings to communicate risk
- The absence of formal classification is widely considered a gap in the ecosystem

### LangChain / LangGraph
- LangChain's `@tool` decorator supports metadata but doesn't standardize security classification
- LangGraph's human-in-the-loop patterns are effectively manual classification — "this tool needs approval"
- No structured field-level metadata

### MCP (Model Context Protocol)
- MCP tool definitions include `inputSchema` (JSON Schema) but no security classification
- There's been discussion about adding "annotations" or "metadata" to tool definitions for risk/classification
- As of early 2026, no standard classification extension exists in the MCP spec
- This is an opportunity: mlld could define a classification extension that MCP servers could adopt

## How mlld Already Does Some of This

mlld has ad hoc classification via **operational labels on exes**:

```mlld
exe destructive @deleteFile(path) = run cmd { rm @path }
exe net:w @sendEmail(to, body) = run cmd { curl -X POST ... }
exe safe @listFiles() = run cmd { ls -la }
```

Labels like `destructive`, `net:w`, `safe` classify the *operation as a whole*. Guards and policy can target these:

```mlld
guard before destructive = when [
  @mx.taint.includes("src:mcp") => deny "MCP data can't trigger destructive ops"
  * => allow
]
```

What's missing:
1. **Field-level classification** — no way to say "the `path` parameter of `@deleteFile` is a control arg"
2. **Output field classification** — no way to say "the `id` field of `@createFile`'s return is promoted"
3. **Standardized vocabulary** — labels are free-form strings, not a defined taxonomy

## Possible mlld Integration

### Using `with` for classification metadata

```mlld
exe @searchContacts(name) = run cmd { curl ... }
  with {
    class: {
      risk: "read",
      args: {
        name: { role: "control", desc: "search target" }
      },
      returns: {
        promoted: ["email", "name", "phone"],
        record_type: "contact"
      }
    }
  }
```

### Or as part of the exe declaration syntax

```mlld
exe read @searchContacts(control name) = run cmd { curl ... }
  with { promotes: ["email", "name", "phone"], record_type: "contact" }
```

Here `read` is the operation risk class, `control` annotates the parameter role, and `with { promotes }` declares output field authorization.

### Propagation through taint/provenance

Classification metadata would flow through the existing security infrastructure:
- When `@searchContacts` executes, the result's `.mx` carries the classification
- Promoted fields are tagged in the store record
- Control arg annotations are available to guards at dispatch time
- Guards can check: "is this value being passed as a control arg? Was it derived from untrusted input?"

### Standard vocabulary (proposed starting point)

**Operation risk levels:**
| Level | Meaning | Examples |
|-------|---------|---------|
| `read` | Read-only, no side effects | search, list, get |
| `write` | Creates/modifies, reversible | create file, update record |
| `destructive` | Irreversible | delete, send email, transfer |
| `admin` | System-level | change permissions, config |

**Argument roles:**
| Role | Meaning | Examples |
|------|---------|---------|
| `control` | Determines target/effect | recipient, file path, account |
| `data` | Carries content | body text, file contents |
| `config` | Operation parameters | limit, format, options |

**Output field roles:**
| Role | Meaning | Examples |
|------|---------|---------|
| `promoted` | Authoritative for authorization | id, email, filename |
| `content` | User/attacker-controllable content | body, description |
| `meta` | System metadata | timestamp, size, count |

## Key Design Questions

1. Should classification be required or optional? (Probably optional — unclassified tools default to conservative behavior)
2. Should classification live on the exe definition, in policy, or in a sidecar file? (Probably exe definition via `with`, matching existing patterns)
3. How does classification compose with existing labels? (`destructive` label on exe + `control` role on arg = both available to guards)
4. For MCP tools where we don't control the definition, how do we attach classification? (Probably in the `import tools` declaration or in policy)
5. Should mlld propose a classification extension for MCP? (Probably yes, eventually)

## What to Investigate Next

- Read the AgentDojo paper closely for their threat model and how control args factor into attacks
- Look at Invariant's policy language for patterns on expressing "arg X must come from tool Y's output"
- Look at whether anyone has proposed a JSON Schema extension for security classification
- Think about how classification metadata interacts with the store's promotion rules — they should be the same data, not two parallel systems
