# Security in Layers: From Safe to Safe and Capable

## The Starting Point

Making an LLM agent secure is straightforward. Label external data as untrusted, block untrusted data from reaching dangerous operations, done. Two declarations in mlld:

```mlld
policy @p = {
  defaults: {
    rules: ["no-untrusted-destructive", "no-secret-exfil"],
    unlabeled: "untrusted"
  },
  operations: {
    destructive: ["fs:w", "tool:w"],
    exfil: ["net:w"]
  }
}
```

Every external input is untrusted. Untrusted data can't reach write operations or leave the system. 0% attack success rate. Your agent is secure.

It's also nearly useless. An email agent that can't use email addresses from emails. A CRM agent that can't act on contact data. A research agent that can't do anything with what it finds. The agent is safe because it can't do anything consequential with the data it handles.

This is where every other approach stops. CaMeL, the strongest published defense against prompt injection, accepts this tradeoff explicitly: 0% attack success rate, 16-23% of legitimate tasks blocked. The taint is too coarse — it can't distinguish "this email address came from the contacts database" from "this email address was injected by an attacker."

mlld's security features exist to close that gap. Each feature unlocks a specific kind of useful behavior that the baseline blocks, without weakening the security guarantee. None of them are required — they're tools you reach for when you need your secure agent to actually do things.

---

## Layer 1: Labels and Policies

**What you have:** Declarative rules about what labeled data can do.

**What it gets you:** Broad protection. Secrets don't leak. Untrusted data doesn't reach destructive operations. External data is automatically tainted. All of this works without thinking about individual tool calls or data paths.

```mlld
var secret @apiKey = @keychain("anthropic")
var @userInput = @input

exe net:w @postToSlack(msg) = run cmd { curl -X POST @channel -d @msg }
exe fs:w @deleteFile(path) = run cmd { rm "@path" }

>> Both of these are blocked:
show @postToSlack(@apiKey)     >> secret can't flow to exfil
show @deleteFile(@userInput)   >> untrusted can't flow to destructive
```

**What it can't do:** Allow *specific* untrusted data through. The policy is all-or-nothing per label. If you block untrusted data from network operations, you block all of it — including the contact email your agent legitimately needs to send to.

**Without mlld:** You'd write if-else checks on every tool call, maintain a list of which data sources you trust, and hope you didn't miss a code path. The policy declaration replaces scattered validation logic with a single auditable artifact.

---

## Layer 2: Guards

**The problem:** Policies are broad. Real security needs exceptions. "Block all network writes from untrusted data — except internal monitoring endpoints." "Block all shell commands — except git status."

**What guards add:** Imperative hooks that inspect data at operation boundaries and make surgical decisions.

```mlld
policy @p = {
  labels: {
    "src:mcp": { deny: ["op:cmd"] }
  }
}

>> But git status is safe — it's read-only
guard @allowGitStatus before op:cmd = when [
  @mx.op.command.startsWith("git status") => allow
  * => allow
]
```

Guards also introduce the privilege model: regular guards can add restrictions but can't override policy. Privileged guards can create exceptions to unlocked policies. Locked policies can't be overridden by anything.

```mlld
>> Privileged guard: strategic exception to a policy denial
guard privileged @authorizedSend before tool:w = when [
  @mx.op.name == "send_email" && @mx.args.recipients == ["ops@internal.com"] => allow
]
>> No wildcard — unmatched calls defer to base policy
```

**What it can't do:** Tell you whether a specific *value* is trustworthy. Guards can inspect labels and metadata, but if two email addresses both carry the `untrusted` label, a guard can't distinguish "this one came from the contacts API" from "this one was injected by an attacker." You need provenance for that.

**Without mlld:** You'd write middleware/interceptors on every tool call, maintain your own allow/deny logic, and build a privilege hierarchy from scratch. Every framework that exposes tools to LLMs eventually builds some version of this. Guards give it a name and a syntax.

---

## Layer 3: Records and Facts

**The problem:** Taint tells you data is untrusted. It doesn't tell you what *part* of the data is trustworthy. A contacts API response contains both authoritative email addresses and user-written bios. Taint marks the entire response the same way. You need field-level trust.

**What records add:** A declaration that classifies each field of a data structure as a fact (authoritative — the source vouches for it) or data (content — useful but not safe for authorization).

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [bio: string?, notes: string?]
}

exe @searchContacts(query) = run cmd {
  contacts-cli search @query --format json
} => contact
```

When the exe returns, `=> contact` applies the record. The `email` field gets a `fact:@contact.email` label — it's authoritative. The `bio` field stays as data — it could contain anything, including injected instructions. If the input was `untrusted`, fact fields get cleared (the source vouches for them). Data fields stay tainted.

Facts flow through the existing label system. No new enforcement mechanism. Policies and guards can now make decisions based on field-level provenance:

```mlld
guard @internalOnly before @sendEmail = when [
  @mx.args.recipient.mx.has_label("fact:internal:@contact.email") => allow
  @mx.args.recipient.mx.has_label("fact:external:@contact.email") => deny "External sends not allowed"
  * => deny "Recipient has no fact proof"
]
```

**What it can't do:** Control what the LLM sees. The LLM still receives the full email address in its context. A prompt injection attack can read the address and encode it in a URL, exfiltrating it through a GET request. The value is protected at the *action* boundary but exposed at the *information* boundary.

**Without mlld:** You'd build your own schema validation layer on every tool result, manually track which fields came from which sources, propagate that metadata through every transformation, and check it at every tool call. This is hundreds of lines of application code per tool integration — code that's different for every project but solving the same problem.

---

## Layer 4: Display Projections and Handles

**The problem:** The LLM is a confused deputy. It has access to values it shouldn't be able to exfiltrate and tools it needs to call with those values. If the LLM can see `mark@example.com`, a prompt injection can encode it in a URL and exfiltrate it via a GET request. You need to control what the LLM sees without preventing it from referencing the value.

**What display projections add:** Control over which fields cross the LLM boundary and in what form. Five modes per field: bare (full value), ref (full value + handle), masked (preview + handle), handle-only (opaque reference), or omitted (not shown at all).

```mlld
record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
```

The LLM sees:
```json
{
  "name": "Mark Davies",
  "email": { "preview": "m***@example.com", "handle": "h_a7x9k2" },
  "notes": "Met at conference"
}
```

The name is bare — the LLM can read it. The email is masked — the LLM sees enough to reference it ("the one ending in example.com") but can't exfiltrate the full address. The handle is an opaque token the runtime issued. When the LLM passes `h_a7x9k2` back in a tool call, the runtime resolves it to the original live value with all its fact labels.

Named display modes let one record serve different agents with different visibility needs:

```mlld
record @email_msg = {
  facts: [from: string, message_id: string],
  data: [subject: string, body: string],
  display: {
    role:worker: [{ mask: "from" }, subject, body],
    role:planner: [{ ref: "from" }, { ref: "message_id" }]
  }
}
```

The worker sees email content (its job) with the sender masked. The planner sees sender and message ID as refs (value + handle for authorization decisions) but never sees the email body (untrusted content that could influence its decisions).

**What it can't do:** Prevent the LLM from hallucinating values. The LLM can't see the real email, but it can fabricate one and pass it to a tool. Display projections control information exposure. You still need something to verify that the value the LLM passes back is one the system actually issued.

**Without mlld:** You'd manually scrub every tool result before sending it to the LLM, maintain your own token-to-value mapping, write resolution logic for every tool call, and handle ambiguity when multiple values mask to the same preview. This is a complete serialization/deserialization layer with security properties — substantial infrastructure that's the same for every agent.

---

## Layer 5: Positive Checks

**The problem:** Taint tracking (layers 1-2) tells you what data is dangerous. Facts (layer 3) tell you what data is trustworthy. Display projections (layer 4) prevent information leakage. But none of these *require* that a tool call's target came from an authoritative source. An LLM that hallucinates `attacker@evil.com` as a recipient — a string the system never issued — isn't caught by any of the above unless you wrote a guard for that specific case.

**What positive checks add:** Rules that *require proof*, not just absence of taint. The recipient must carry a fact label from a known source. No proof, no action.

```mlld
policy @p = {
  defaults: {
    rules: ["no-send-to-unknown", "no-destroy-unknown"]
  },
  operations: {
    "exfil:send": ["tool:w:send_email"],
    "destructive:targeted": ["tool:w:delete_contact"]
  }
}

exe exfil:send @sendEmail(recipient, subject, body) = run cmd {
  email-cli send --to @recipient --subject @subject --body @body
} with { controlArgs: ["recipient"] }
```

`no-send-to-unknown` requires the `recipient` control arg to carry fact proof or a `known` attestation. A handle that resolves to a value with `fact:@contact.email` passes. A hallucinated string with no provenance is blocked — even if it looks like a valid email address.

`controlArgs` declares which parameters are security-relevant. Payload args (subject, body) remain ordinary data — the agent is expected to compose those freely. Only control args need proof.

**Without mlld:** You'd write validation logic on every write tool that checks whether the target value exists in your database, maintain a registry of "values the system has seen," and add these checks to every tool integration. This is essentially reimplementing the handle registry and positive check system — the same provenance-tracking infrastructure, built ad hoc.

---

## Layer 6: Planner-Worker Authorization

**The problem:** A single agent that reads untrusted content and makes decisions is inherently vulnerable to influence — the untrusted content shapes its reasoning, which shapes its actions. Taint tracking catches data flow, but it can't catch *decision influence*. The agent reads a malicious email and decides to act differently — the values it uses might all be legitimate, but the decision to use them was influenced.

**What planner-worker adds:** Architectural separation. A clean planner that never sees untrusted content decides what actions are authorized. A worker that processes untrusted content executes within those constraints. The planner works with handles from display-projected tool results. The worker can only call tools the planner authorized, with the specific arguments the planner approved.

```mlld
var @plannerResult = @planner(@task) | @parse
var @auth = @policy.build(@plannerResult, @writeTools)
var @result = @worker(@task) with { policy: @auth.policy }
```

The planner produces bucketed intent: `resolved` (handle values from tool results), `known` (values the user explicitly provided), and `allow` (tools needing no argument constraints). The policy builder validates handles resolve, checks that `known` values come from uninfluenced sources, rejects proofless literals, and strips data args. The compiled policy constrains the worker.

The worker processes untrusted content and decides what to do — but its options are bounded by the planner's authorization. A prompt injection in the email body can convince the worker to try anything. The authorization window limits what actually succeeds.

**Without mlld:** You'd build your own planning layer, your own authorization format, your own policy compiler that validates planner output against tool schemas, your own constraint enforcement on worker tool calls. This is a complete authorization system — the kind that takes months to build and years to harden.

---

## Layer 7: Shelf Slots

**The problem:** Agents accumulate state over time — building candidate lists, narrowing selections, tracking progress across multiple steps. Without typed state, an agent can shelve hallucinated entities into shared state, merge data incorrectly, or select a "winner" that was never a candidate. State accumulation is where grounding errors compound.

**What shelf slots add:** Typed, record-backed state surfaces with schema validation, grounding checks, merge semantics, and cross-slot constraints.

```mlld
shelf @pipeline = {
  candidates: contact[],
  qualified: contact[] from candidates,
  selected: contact? from qualified
}
```

When an agent writes to `candidates`, the runtime validates the value against the `@contact` record schema. Fact fields must arrive as handles — the runtime resolves them and checks they carry fact labels. Hallucinated entities with no provenance are rejected. The `from` constraint on `selected` means the agent can only select an entity that exists in `qualified` — it can't hallucinate a winner.

Merge semantics are implied from the record and slot shape: keyed records upsert by key, keyless records append, singular slots replace. Writes are atomic — if any element in a batch fails, the whole write is rejected.

**Without mlld:** You'd write `sanitizeComparisonData()`. And `validateCandidateList()`. And `ensureWinnerIsCandidate()`. And custom merge logic for every state surface. And provenance tracking on every accumulated value. This is exactly where the benchmark complexity that started this entire design conversation lives — ad hoc validation code that's different for every agent but solving the same structural problem.

---

## The Full Picture

Each layer adds a specific capability to the secure baseline:

| Layer | What it adds | What it unlocks |
|---|---|---|
| Labels + Policies | Broad data flow rules | Secrets don't leak, untrusted data is contained |
| Guards | Surgical exceptions | Specific operations allowed through broad restrictions |
| Records + Facts | Field-level provenance | Distinguish authoritative data from content |
| Display Projections + Handles | Information exposure control | Agents work with data they can't exfiltrate |
| Positive Checks | Proof requirements | Hallucinated targets are blocked structurally |
| Planner-Worker | Decision/execution separation | Untrusted content can't influence authorization decisions |
| Shelf Slots | Grounded state accumulation | Agents build up entity lists without hallucination drift |

You don't need all seven layers. You need as many as your agent's job demands:

- An agent that summarizes documents needs layer 1.
- An agent that processes untrusted input needs layers 1-2.
- An agent that acts on external data needs layers 1-5.
- An agent that orchestrates multiple steps with untrusted context needs layers 1-6.
- An agent that accumulates and selects from grounded entities needs layers 1-7.

Each layer solves a specific problem that you *will* encounter when building capable agents that handle real-world data. mlld gives you a declaration for each problem. The alternative is building the same infrastructure in application code — more complex, harder to audit, different for every project, and solving the same problems mlld already solved.
