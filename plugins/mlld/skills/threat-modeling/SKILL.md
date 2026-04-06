---
name: mlld:threat-modeling
description: Threat modeling for LLM agents using ThreatDown attack trees and coverage tables. Teaches the discipline of enumerating attacker goals before designing defenses, so architecture is driven by threats rather than intuition. Use when building defended agents, auditing existing agent security, planning rewrites, or documenting the threat model for review.
---

## Core thesis

**The threat model is the architecture.** If you design defenses first and then see what they catch, you will miss attack classes that your intuition didn't anticipate. If you enumerate attacks first and then design layers to block them, your architecture is auditable against an explicit set of goals.

This is particularly important for LLM agents. You cannot stop an LLM from being tricked by prompt injection — that's a property of language models, not a bug you can fix. You CAN prevent the *consequences* of being tricked from manifesting. But you can only prevent consequences you've enumerated. A threat model is how you make sure you enumerated them.

This skill teaches a lightweight discipline: write the attacker's goal at the top, enumerate the methods, enumerate the conditions each method requires, and mark each condition with a structural mitigation (or an explicit gap). The result is a document that doubles as a security specification and an implementation checklist.

## When to use this skill

- Before building a defended agent — enumerate what you're defending against
- Before a rewrite — capture the current threat coverage so the new version can be audited
- During security review — structured view of what each layer catches
- When onboarding contributors — the threat model explains *why* each security primitive exists
- When pitching security properties to stakeholders — concrete, checkable claims

## Format: ThreatDown

ThreatDown is a markdown-friendly attack tree notation. Files use the `.threatmodel.txt` extension (plain text, human-readable, diffable). A tree has:

| Element | Meaning |
|---|---|
| `__Root attacker goal__` | Bold root — the attacker's objective |
| `-` (dash) | OR branch — alternative methods (each method is one way to achieve the parent goal) |
| `+` (plus) | AND branch — required condition for the parent method, OR alternative mitigation under a condition (defense in depth — any one holding is sufficient) |
| `&` (ampersand) | Composite mitigation — required part of a multi-part defense where ALL parts must hold together for the defense to block the condition |
| `[ ]` | Not addressed — no mitigation exists, open architectural question |
| `[!]` | Vulnerability identified — concrete attack path with no current defense, or a defense with a known flaw |
| `[?]` | Speculative — mitigation exists in reference code and needs to be ported/validated, OR speculative attack path needing investigation |
| `[-]` | Confirmed by code review — read the code, cited implementation, behaves as described |
| `[x]` | Confirmed by targeted tests — tests exist that exercise the specific mitigation against the specific attack |
| `#tag-name` | Stable reference to a named primitive or layer |

### Status progression

`[ ]` → `[?]` → `[-]` → `[x]`

Most items start at `[ ]` (unexamined) or `[?]` (claimed but not verified). Code review upgrades to `[-]`. A targeted test that isolates the primitive and confirms it fires against the attack upgrades to `[x]`. `[!]` is reserved for confirmed vulnerabilities — gaps or flawed defenses that need to be fixed.

### The gap between `[-]` and `[x]` matters

Reading the code and seeing that a primitive is declared is `[-]`. Verifying that the primitive actually fires against the specific attack is `[x]`. **Most security reviews stop at `[-]`**, which is dangerous because a primitive can be declared but not activated, misconfigured, or bypassed by the attack path you didn't think of.

A targeted test has three parts:

1. Run the attack with the primitive enabled — verify it's blocked
2. Run the attack with the primitive disabled — verify it succeeds (proves THIS primitive is what's blocking it, not something else)
3. Run a legitimate task that exercises the primitive — verify the legitimate case still works

Without (2), you don't know if your defense is actually doing the work. Maybe the attack was failing for a different reason — the model's training, the task's phrasing, phase isolation. Aggregate ASR metrics like "0% ASR on AgentDojo" do not validate any specific primitive. They validate "nothing reached the attacker's goal across the test suite," which is multi-causal.

### Nested detail blocks

Every non-trivial mitigation should have a nested `>` block below it that describes the mechanism, the primitives involved, and any open questions. The `>` is aligned with the mitigation name (past the checkbox), not with the bullet:

```threatdown
- Method
  + Condition
    + [?] `#primitive-name`
         > How this mitigation works. Short prose explaining the mechanism.
         > The mlld primitives or configuration pattern involved.
         > Any open questions, notes, or edge cases.
         >
         > Reference: where this is implemented in the current codebase.
         > Will be updated during the rewrite.
```

**The description should be implementation-ready.** Someone reading the nested block (combined with mlld documentation) should be able to reimplement the defense from scratch. Citations to reference code are useful but should not be load-bearing — they'll be updated as the code changes. The description is the durable content.

### Example skeleton

```threatdown
__Root attacker goal__
- Method A (one way to achieve the goal)
  + Condition 1 (must hold for method A to work)
    + [?] `#primitive-one`
         > Short description of how this defense works structurally.
         > Which mlld primitives are involved and how they compose.
         > Reference: where it lives in the current code (e.g., tool metadata file).
    + [!] `#primitive-two`
         > Known gap. Explains what the vulnerability is and what would close it.
  + Condition 2 (also must hold)
    + [-] `#primitive-three`
         > Confirmed by code review. Describes the mechanism and cites the implementation.
- Method B (alternative way to achieve the goal)
  + Speculative condition
    + [?] `#primitive-four`
         > Possibly applicable. Needs verification — what would upgrade this to [-] or [x].
```

### Rules

- **Methods are OR'd.** Any successful method achieves the attacker's goal.
- **Conditions are AND'd.** For a method to succeed, every condition must hold.
- **A mitigation blocks a condition.** If any mitigation on a condition holds, the condition fails, so the method fails.
- **`+` mitigations are OR'd under a condition — defense in depth.** This is a feature, not redundancy — if one fails, another catches it.
- **`&` mitigations are AND'd under a condition — composite defense.** All `&` siblings are parts of a single logical defense; all must hold together for the defense to block the condition. Use `&` when the defense is genuinely a workflow (e.g., extract + cross-reference + resolve) where disabling any one part breaks the whole defense.
- **Rule of thumb for `+` vs `&`:** If you can disable one mitigation and the remaining ones still defend against the attack, use `+` (defense in depth). If disabling any one mitigation opens the attack, use `&` (composite defense). When in doubt, ask "could an attacker exploit this if I turned off just this one primitive?" — if yes, it's `&`.
- **Every `[!]` deserves a prominent entry in the "Known vulnerabilities" section** at the bottom of the file. Gaps are OK as long as they're explicit; what's not OK is an unverified assumption that "something catches this."

### Composite defenses: graduation and marking

Composite defenses (`&` groups) have stricter graduation rules than alternative defenses (`+` groups):

| Group type | Graduates to `[x]` when | Graduates to `[-]` when |
|---|---|---|
| `+` alternatives | **Any one** primitive in the group has a targeted test that fires against the attack with the primitive enabled, and the attack succeeds when the primitive is disabled | **Any one** primitive has been code-reviewed and the configuration is wired |
| `&` composite | **Every** primitive in the group has a targeted test AND an integration test confirms the composed defense blocks the attack end-to-end | **Every** primitive has been code-reviewed AND the composition (the order/wiring of the parts) has been reviewed |

In the coverage table, a composite defense is listed as **one row** with a composite tag that references all parts, not as multiple rows. The mark on that row is the minimum mark across all component parts.

Example composite entry in a coverage table:

```markdown
| Primitive | Attack classes | Mark |
|---|---|---|
| `#bill-file-IBAN-grounding` (composite: extract → cross-reference → resolve) | banking Class 5 | [?] — all three parts specced, none tested |
```

If one part is `[-]` and two are `[?]`, the composite mark is `[?]` (the minimum). Graduating to `[x]` requires all three parts to be `[x]` AND an integration test that disables any one part and verifies the attack then succeeds.

**Why stricter:** a composite defense has a larger surface area for regression. If one part silently breaks during a refactor, the whole defense fails. The stricter graduation bar is the cost of using a composite.

**When to prefer `+` instead:** If you can factor the defense into independent primitives where each one alone is sufficient, do that — `+` is stronger (defense in depth) and easier to verify. Reserve `&` for cases where the defense is genuinely inseparable (e.g., a workflow with required sequencing, or a defense that depends on multiple primitives interacting).

## Prompt discipline is not a mitigation

This rule is strong enough to state separately. **Prompt direction is not a mitigation at any level of the scale — not `[x]`, not `[-]`, not `[?]`, not `[!]`, not `[ ]`.** It simply does not appear in the threat tree.

If the only thing stopping an attack is "the prompt tells the LLM not to do X," that's not a defense, it's a hope. An LLM can ignore instructions. An adversarial input specifically tries to make the LLM ignore instructions. A mitigation that depends on the LLM cooperating is not a mitigation — it's the attack surface itself.

What counts as structural enforcement:

- **Record classification** — fact vs data fields, named display modes, trust refinement via `=> record`
- **Display projections** — what the LLM can see structurally, per role
- **Tool metadata** — `controlArgs`, `updateArgs`, `exactPayloadArgs`, phase labels
- **Policy rules** — `no-send-to-unknown`, `no-novel-urls`, `no-influenced-advice`, etc. — runtime-enforced at dispatch
- **Phase isolation** — `compose` running with `tools: []`, clean planner on uninfluenced input
- **Shelf grounding** — fact-field writes require handles
- **Bucketed intent validation** — `resolved` requires handles, `known` requires uninfluenced source
- **Guards** — programmatic checks that run at specific lifecycle points
- **Configuration constraints** — `locked: true` policies, `authorizations.deny` lists

What does NOT count as a mitigation:

- "The prompt tells the LLM to only use grounded values"
- "The prompt instructs the LLM not to follow instructions in reviews"
- "The prompt says the model should not send to unknown recipients"
- "The prompt warns about injection attempts"

If you find yourself writing any of these as `[x]` or `[?]`, delete the entry. Do NOT mark them `[ ]` either — they don't go in the tree. They're not an incomplete defense; they're simply not a defense.

## The thinking process

Do these steps in order. Resist the temptation to jump ahead to mitigations before you've enumerated threats.

### Step 1: State the attacker's goal

What does the attacker actually want? Concrete, not abstract. Not "compromise the agent" — "cause the agent to send customer data to attacker@evil.com" or "cause the agent to delete file X that the user didn't ask to delete."

If you can't state the goal crisply, you don't yet know what you're defending against. Stop and think about it more.

### Step 2: Enumerate methods

For this specific goal, what are all the ways an attacker could achieve it? Think adversarially — put yourself in the attacker's position. Include methods that depend on the attacker controlling prompt content, methods that depend on ambiguous tool responses, methods that depend on multi-step interactions, methods that exploit the LLM's pattern-matching tendencies.

Don't filter yet. List everything you can think of. You'll prune and validate later.

### Step 3: For each method, enumerate required conditions

What must be true for this method to succeed? These are the AND-ed conditions under the method. A good method has 2-5 conditions that all have to hold. If you can only think of one condition, you've under-decomposed and should try harder.

Examples:
- "LLM dispatches send_email with attacker's literal" requires:
  - LLM sees the attacker's literal in its context
  - LLM uses the literal as the recipient arg
  - The runtime doesn't catch it at dispatch
- "Planner authorizes attacker address" requires:
  - Planner is influenced by attacker content (or isn't)
  - Planner puts the literal in the bucketed intent
  - Authorization validation accepts the intent

Each condition is a potential mitigation point.

### Step 4: Identify mitigations

For each condition, what blocks it? Only structural enforcement counts. See the "Prompt discipline is not a mitigation" section — if your proposed defense is a prompt instruction, it doesn't belong in the tree at all.

Categories of structural enforcement (from strongest to weakest):

1. **Schema-level enforcement** — record classification, display projections, trust refinement. The attack is impossible because the LLM literally cannot see or produce the offending value.
2. **Tool metadata enforcement** — `controlArgs`, `updateArgs`, `exactPayloadArgs`, phase labels. The runtime rejects the call at compile time or dispatch.
3. **Policy rules** — `no-send-to-unknown`, `no-novel-urls`, `no-influenced-advice`, etc. Runtime-enforced at dispatch based on labels and flow.
4. **Phase isolation** — structural constraints on what each phase can see and do (e.g., `tools: []` on compose).
5. **Guards** — programmatic checks at specific lifecycle points. Weaker than the above because they depend on correct guard implementation.

For each mitigation:
- Tag it with a stable name: `#display-projections`, `#handles`, `#no-send-to-unknown`, etc.
- Add a nested `>` block describing the mechanism, the primitives involved, and the configuration pattern — enough that a reader could reimplement the defense
- Mark it according to verification level: `[?]` (exists in reference), `[-]` (confirmed by code review), `[x]` (confirmed by targeted test)
- Mark identified gaps as `[!]` (vulnerability) or `[ ]` (not addressed) — be honest about what's not defended

### Step 5: Check for gaps and orphaned defenses

Every condition should have at least one structural mitigation. Conditions without one are `[!]` (known vulnerability) unless you're explicitly accepting them as out of scope.

**Watch for orphaned defenses.** A defense can exist in the runtime, exist in the tool library, have been validated by tests in a prior version — and still not be deployed in the current configuration. This is especially common after refactors. When you cite a primitive, verify:

1. **The primitive exists in the runtime** (read the implementation)
2. **The primitive is wired into the current configuration** (read the config that enables it)
3. **The primitive actually fires against the specific attack** (ideally via a targeted test)

A primitive that passes (1) but fails (2) is a `[!]` (orphaned defense — the attack is NOT currently defended). A primitive that passes (1) and (2) but not (3) is `[-]` (code review confirmed but no test). A primitive that passes all three is `[x]`.

Gaps are OK as long as they're explicit. What's not OK is an unexamined condition, or a defense marked `[x]` that's actually orphaned.

### Step 6: Build the coverage table

After the trees are done, produce the inverse view. For each mitigation primitive, list the attacks it catches and its current verification status. This is the layer-centric view:

```markdown
| Primitive | Attack classes | Mark |
|---|---|---|
| `#display-projections` stripping content from planner | 1, 3, 7 | [?] |
| `#handles` + `#bucketed-intent-resolved` | 1, 3, 5 | [?] |
| `#no-send-to-unknown` | 1 | [?] |
| `#no-novel-urls` | 1 (URL exfil) | [?] — needs verification of full-string comparison |
| `#correlate-control-args` | 3 | [!] — not declared on affected tools |
```

Each row carries the mark state from the trees. If a primitive has different verification states in different trees, pick the most conservative mark (lowest on the progression). The coverage table should never be more confident than the individual trees.

### Step 7: Surface load-bearing single points of failure

In the audit notes section, identify mitigations that are the ONLY defense for a critical attack class. These are single points of failure — if the primitive regresses, the attack is immediately exploitable. Load-bearing primitives deserve:

- Targeted tests (to catch regressions)
- Documentation of the exact configuration that activates them
- Cross-references from other files so changes flag the risk

### Step 8: Identify policy rule candidates

Look at your `[!]` items and ask: is this a **configuration gap** (the suite just needs to declare something) or a **policy rule candidate** (a new runtime rule would defend this attack class across all suites)?

Configuration gaps are per-suite fixes. Policy rule candidates are framework-level additions that benefit all users. Surface the distinction in your audit notes so the reader knows which items need per-suite changes vs which might warrant new runtime primitives.

This table is your architecture checklist. It also reveals single points of failure: if a primitive is the *only* mitigation for three different attacks, it's load-bearing and deserves extra scrutiny.

## Taxonomy: common attack classes for LLM agents

Start here when you're thinking about what to enumerate. Most LLM agent threats fall into one or more of these classes:

1. **Exfiltration** — sensitive data leaves the system via a channel (email, network, file, URL, log). Includes both direct exfil (send data to attacker) and covert channels (data encoded in URL query params, timing channels).

2. **Unauthorized writes** — destructive or modifying operations executed against the wrong target. Delete the wrong file, update the wrong record, transfer money to the wrong account.

3. **Payload manipulation** — the content or fields of a legitimate operation drift from the user's actual intent. User asked for "feedback scores," agent sent "TODOs for the week." The target is right; the payload is wrong.

4. **Identity confusion** — the agent believes value X is actually value Y. Usually happens across LLM boundaries where structured data becomes text and then becomes structured data again. Closely related to cross-phase identity loss.

5. **URL / covert channel exfiltration** — data encoded in URLs (fetch-as-write-channel), in DNS queries, in file paths. Especially dangerous because URLs often look benign.

6. **Cross-phase trust laundering** — tainted data becomes "trusted" by passing through a phase that clears labels without authority to do so.

7. **Authorization bypass** — the planner is influenced by attacker content, or control args are forged, or the authorization validation misses a case.

8. **State corruption** — durable state (shelf, database, files) is poisoned with attacker-controlled values that later steps will trust.

9. **Consequence chaining** — individually benign steps compose into an attack. No single step looks wrong, but the sequence achieves the attacker's goal.

10. **Content injection** — attacker text reaches the LLM as instruction rather than data. The classic prompt injection case.

Not every agent faces every class. A read-only agent doesn't face unauthorized writes. A local-only agent doesn't face network exfil. But you should explicitly decide which classes apply and which don't, and write down the reasoning.

## Scope and composition: per-domain vs cross-domain

One threat model rarely covers a whole system. Real agents combine multiple capabilities (email, banking, slack, travel, filesystem), and each capability has its own attack surface. A single giant threat model becomes unreadable and hard to audit.

The better pattern is **one threat model per security-bounded domain**, composed together via a router (or equivalent dispatch layer) that handles cross-domain concerns separately.

### Per-domain threat models

Each domain threat model covers attacks within that domain's capability surface:

- `banking.threatmodel.txt` — attacks on money transfers, credential changes, transaction manipulation
- `workspace.threatmodel.txt` — attacks on email/calendar/files within a single workspace
- `slack.threatmodel.txt` — attacks on messaging, URL fetches, channel membership

Each per-domain model has a clearly bounded scope. The attacker in the banking threat model wants banking-specific outcomes (wrong transfer, credential change). The attacker in the slack threat model wants messaging-specific outcomes (wrong recipient, content leak to public channel). The attacks within each domain are self-contained.

### Cross-domain threat models

Some attacks cross domains: "use slack to exfil data the agent read from workspace," "use banking credentials to log into slack," "pivot from one domain's state into another's." These are not caught by per-domain models because each domain's agent only sees its own capabilities.

Cross-domain attacks belong in a separate threat model that covers the *composition* layer — typically a router that decides which domain agent(s) handle a given task, and how cross-domain state flows between them.

The router's threat model includes:

- **Domain confusion** — router picks the wrong domain for a task
- **Routing manipulation** — attacker influences the router's choice of domain
- **Cross-domain state leakage** — state from one domain reaches another without authorization
- **Unauthorized domain elevation** — a task in a low-privilege domain triggers a high-privilege domain's tools
- **Multi-domain consequence chaining** — a benign-looking sequence across domains composes into an attack

### Why this decomposition works

Splitting threat models along the router boundary is not just organizational convenience — it matches the actual security boundary. Per-domain agents should not even see tasks from other domains (structurally enforced by the router), so per-domain threat models can legitimately ignore cross-domain attacks. The router owns those.

The decomposition also lets you ship per-domain coverage incrementally. A new agent can launch with full per-domain threat models even if the router's threat model is still being built — because the domain agents' security properties don't depend on the router's properties for within-domain attacks.

### When to write which

- **Always write per-domain threat models** for any bounded capability surface.
- **Write a cross-domain threat model** when the system has more than one domain *and* cross-domain state flows exist *or* a router chooses between domains.
- If your system is single-domain (one capability surface), the per-domain threat model IS the whole threat model. No router, no cross-domain concerns.

### Scope declaration in per-domain threat models

Each per-domain threat model should open with a brief scope statement that makes the boundary explicit:

```markdown
## Scope

This threat model covers attacks within the {domain} capability surface — {brief description of the capability surface and the tools it exposes}. Cross-domain attacks (e.g., using this domain as a pivot to reach other domains) are out of scope here and are covered in the cross-domain threat model.
```

This prevents readers from expecting the model to cover something it doesn't, and it flags the cross-domain threat model as a related document.

## Threat models as rewrite specifications

Threat models can be used in two distinct modes:

**Audit mode:** document what the current implementation defends against. Every item is `[ ]`, `[!]`, `[?]`, `[-]`, or `[x]` based on what the current code actually does.

**Spec mode:** document what a NEW implementation (a rewrite) must defend against. Every `[?]` item is "preserve this capability from the reference." Every `[!]` is "fix this gap in the rewrite." Every `[ ]` is an architectural decision the rewrite must make. `[-]` and `[x]` are reserved for the new code as it's written and validated.

Spec mode is useful when you're rewriting an existing implementation. The threat models describe what the new code must achieve, using the old code as reference material. This is different from audit mode in two ways:

1. **Most items are `[?]`, not `[x]`.** The rewrite hasn't been written yet, so nothing is code-review-confirmed or test-confirmed in the new code. The marks reflect "this needs to be in the rewrite" not "this is confirmed in the running code."

2. **Citations to reference code are transient.** When you cite a file:line in the reference, you're saying "here's how the pattern was done before, use it as a reference." After the rewrite lands, those citations should be updated to the new code locations. Don't over-invest in perfecting citations to code that's about to be replaced.

When writing in spec mode, include a "Notation" section at the top of each file explaining the interpretation:

```markdown
This document is the **specification for the {framework} rewrite**. The trees below describe what the new implementation must defend against. Where a defense already exists in the reference implementation, the item is marked `[?]` and a description explains how to preserve it. Where a defense is missing, the item is marked `[!]` and the rewrite must close the gap.
```

**Orphaned defenses are a special case for spec mode.** A defense that exists in the runtime and the tool library but is NOT wired into the current configuration is still a `[?]` — the mechanism exists and needs to be preserved. But you should also mark a specific `[!]` capturing the wiring gap that must be closed. Both items refer to the same underlying defense; the `[?]` says "preserve this," the `[!]` says "actually wire it in this time."

## Worked example: recipient exfiltration via send_email

Concrete application of the format to a canonical agent attack, using spec-mode notation with nested detail blocks.

```threatdown
__Attacker causes email to be sent to attacker-controlled address__
- LLM dispatches send_email with a literal "attacker@evil.com"
  + LLM sees attacker@evil.com in its context (from an injected email body)
    + [?] `@email_msg.display.planner` strips body content
         > The email record's `planner` display mode omits `subject`, `body`, and `attachments`
         > entirely, showing only identity fields (id_, sender, recipients/cc/bcc in masked form)
         > plus timestamp and read status. The planner never sees email content, so it cannot
         > be instructed by injected text in message bodies to authorize wrong actions.
         > The rewrite must define an email record with a planner display mode that includes
         > only identity and metadata fields.
    + [?] `#untrusted-llms-get-influenced`
         > When the execute worker reads email bodies, its output is labeled `influenced`.
         > This propagates to downstream label-flow checks.
  + LLM uses the literal as the recipient arg
    + [?] `#handles` + `#bucketed-intent-resolved`
         > `send_email.controlArgs: ["bcc", "cc", "recipients"]` — all three destination fields
         > are security-relevant. Values in the `resolved` bucket must be minted handles; bare
         > literals are rejected as `proofless_resolved_value`. The attacker address is never
         > minted as a handle because it never appears in any legitimate tool result.
    + [?] `#no-send-to-unknown`
         > `send_email` carries `comm:w` and `exfil:send` labels, placing it in the `exfil:send`
         > operations group. The rule requires destination control args to carry `fact:*` proof
         > or `known` attestation.
  + Worker copies a masked preview string instead of the handle
    + [?] `#boundary-canonicalization`
         > Masked preview modes emit non-valid-email placeholders. The runtime's boundary
         > canonicalization resolves unique previews back to their handles at the authorization
         > compiler. Ambiguous previews fail closed with handle-wrapper guidance.
- Planner authorizes the attacker address in bucketed intent
  + Planner is influenced by attacker content (clean-planner principle violated)
    + [?] `#clean-planner` + `#known-uninfluenced-source`
         > The planner phase must run on uninfluenced input only. `known` values from a planner
         > whose input is tainted are rejected at the authorization compiler.
  + Planner puts literal in `resolved` bucket
    + [?] `#bucketed-intent-resolved`
         > The authorization compiler rejects bare literals in the `resolved` bucket. Every
         > non-empty control arg value must be a resolvable handle.
  + Planner puts literal in `known` bucket
    + [?] `#task-text-validation`
         > `@policy.build(..., { task: @query })` validates that `known` literal values appear
         > verbatim in the user task text. Attacker addresses never appear in legitimate user
         > tasks, so the check fails closed.
- Shelf state promotes the attacker address to trusted
  + attacker value reaches a shelf write path
    + [x] `#shelf-grounding` — fact-field writes require handles, not literals
    + [x] `#cross-slot-constraints` — `from` clauses prevent hallucinated selections
- Extract phase produces a payload with attacker recipient
  + Extract phase produces a payload object with attacker-shaped recipients
    + [?] Phase discipline — extract doesn't resolve
         > Phase separation invariant: extract reads content from a grounded target but does
         > not resolve identifiers. Recipient-like fields come from a separate resolve phase
         > that produces handle-bearing contacts.
    + [!] `#output-contract-enforcement`
         > **Reference implementation gap.** Framework-level coercion of extract output against
         > a configured record is specced but not yet shipped in the current waterfall. The
         > rewrite must enforce extract output contracts so recipient-like fields in extracted
         > payloads are typed as handles, not bare strings.
- Attacker-controlled bill file launders IBAN into send_money recipient
  + File is trusted as source for IBAN extraction
    & [?] `#bill-file-grounding-extract-to-untrusted`
         > Step 1: The bill file parse produces extracted values in `data: untrusted`
         > fields. The IBAN is not minted as a fact on extraction alone.
    & [?] `#bill-file-grounding-cross-reference`
         > Step 2: Before the IBAN can be used as a `send_money` recipient, the runtime
         > cross-references the extracted value against the user's trusted payee list.
         > Only cross-reference hits proceed.
    & [?] `#bill-file-grounding-resolve-to-handle`
         > Step 3: A match in the trusted payee list produces a handle-bearing payee
         > record. The `send_money` recipient control arg resolves via that handle, not
         > the raw extracted value.
         >
         > These three parts form one composite defense. Disabling any single part breaks
         > the whole chain: without step 1 the IBAN reaches control args directly;
         > without step 2 arbitrary extracted IBANs can ground; without step 3 the
         > recipient still flows from untrusted data. Graduation to [x] requires targeted
         > tests for each part PLUS an integration test that confirms the chain blocks
         > attacker-controlled bill file IBANs end-to-end.
```

Notice the two distinct group types in this tree:

- **`+` group** (defense in depth): "LLM dispatches with literal" has four independent mitigations (`@email_msg.display.planner`, `#untrusted-llms-get-influenced`, `#handles`, `#no-send-to-unknown`). Any one of them blocks the attack. Disabling one still leaves the others defending. The coverage table lists them as four separate rows.

- **`&` group** (composite defense): "File is trusted as source for IBAN extraction" has three parts of one workflow. Each part is necessary but not sufficient; all three must hold for the defense to work. Disabling any part breaks the whole chain. The coverage table lists them as **one row** tagged `#bill-file-grounding`, not three.

**Coverage snippet for this attack:**

```markdown
| Primitive | Attack classes | Mark |
|---|---|---|
| `@email_msg.display.planner` strips content | recipient exfil, content injection | [?] |
| `#handles` + `#bucketed-intent-resolved` | recipient exfil, target confusion | [?] |
| `#no-send-to-unknown` | recipient exfil | [?] |
| `#boundary-canonicalization` | preview-as-recipient | [?] |
| `#clean-planner` + `#known-uninfluenced-source` | influenced authorization | [?] |
| `#task-text-validation` | attacker literal in known bucket | [?] |
| `#output-contract-enforcement` | extract-phase drift | [!] — specced, not shipped |
| `#bill-file-grounding` (composite: extract-untrusted + cross-reference + resolve-to-handle) | bill-file IBAN laundering | [?] — all three parts specced, none tested |
```

Notice: the "LLM dispatches with literal" method has four independent structural mitigations. That's defense in depth — even if `@email_msg.display.planner` fails (misconfigured display mode), `#handles` and `#no-send-to-unknown` still block the attack. The single `[!]` is an honest gap the team knows about.

Notice also: `#bill-file-grounding` is listed as **one row** with a composite tag, not three. Its mark is the minimum of the three component marks. Graduating it to `[x]` requires testing each part AND an integration test that verifies the composed chain — a stricter bar than the `+` alternatives above.

## Principles for good threat models

**1. Start from goals, not from features.**
"What does the attacker want?" not "What security features do we have?" If you start from features, you'll list the features that exist and stop there.

**2. Be adversarial, not defensive.**
Imagine you're the attacker. How would YOU break this? Good threat models are uncomfortable to write because they force you to assume your defenses fail.

**3. Decompose conditions until they're atomic.**
A condition like "attacker tricks the LLM" is too coarse to mitigate. Keep decomposing: "attacker gets content into the LLM's context" AND "LLM treats content as instruction" AND "the action is dispatched without check." Now each piece is a mitigation point.

**4. Only structural mitigations count.**
Prompt instructions do not belong in the tree at any mark level. If your only defense is "the prompt says don't," you have no defense. A mitigation must be something the runtime enforces or the configuration makes structurally impossible.

**5. Multiple mitigations per condition are good, not redundant.**
Defense in depth. If the trees show a condition with five mitigations, that's a strong defense. If they show a condition with one mitigation, that's a single point of failure worth auditing and testing explicitly.

**6. Gaps must be explicit.**
A condition with no mitigation is either `[!]` (we confirmed the attack works) or `[ ]` (open architectural question). A condition with a claimed mitigation that hasn't been verified is `[?]`. Never claim `[x]` without a targeted test.

**7. Verify orphaned defenses specifically.**
A defense can exist in the runtime and the tool library and still not be wired into the current configuration. Always verify three things: the primitive exists in the runtime, the primitive is wired into the current configuration, the primitive actually fires against the specific attack. Missing any of these downgrades the mark.

**8. Keep tags stable.**
`#display-projections` should mean the same thing in every tree. Stable tags let you build the coverage table by grepping, and they let you audit "what does layer X actually catch?"

**9. One tree per attack class, not per task.**
Real agents face many specific attack instances. Consolidate into classes. A tree for "recipient exfiltration" covers dozens of specific attacks; a tree per specific attack becomes unmaintainable.

**10. Descriptions are the durable content, citations are transient.**
When writing nested `>` blocks, invest in the description of HOW the mitigation works. Citations to specific file:line in the reference code will be updated after any rewrite. The description — combined with primitive documentation — should be sufficient to reimplement the defense from scratch.

**11. Distinguish configuration gaps from policy rule candidates.**
Some gaps are fixable per-suite by declaring a primitive correctly (e.g., adding a field to `controlArgs`). Others point at missing runtime primitives that would benefit all users if added as default rules. In the audit notes, surface the distinction explicitly.

**12. Aggregate ASR doesn't validate specific primitives.**
"0% ASR against the benchmark" is multi-causal — it could be model behavior, phase isolation, task phrasing, or the specific primitive you think is doing the work. Only a targeted test that disables the primitive and verifies the attack then succeeds can confirm the primitive is load-bearing.

## Anti-patterns

**Listing defenses and calling it a threat model.**
A list of "we have X, Y, Z" is not a threat model. A threat model says "attacker wants goal A, method M achieves it, condition C enables M, mitigation X blocks C." Without the causal chain, you don't know if your defenses actually defend.

**Abstract goals.**
"Compromise the agent" is not a goal. "Cause the agent to email customer database to attacker@evil.com" is. Abstract goals produce abstract methods produce abstract mitigations. Be concrete.

**Skipping conditions.**
A method with no AND-conditions hides assumptions. "LLM sends wrong email" as a single node hides: "LLM sees attacker address," "LLM uses it as arg," "runtime doesn't catch it." Each of those is a separate mitigation point.

**Procedural mitigations everywhere.**
If most of your `[x]` entries are "prompt says to validate X" or "manual review," the agent is secured by hope. Move to structural wherever possible.

**Mitigation tags that mean different things in different trees.**
If `#validation` sometimes means input validation and sometimes means output validation, the coverage table is useless. Pick a canonical name per distinct mechanism.

**Closing `?` without evidence.**
"I decided this method isn't viable" requires evidence, not confidence. Demote `?` only when you can describe why the path doesn't work.

## Output structure

When you're done, produce:

### 1. Threat model document

One section per attack class. Each section has:
- Short prose introduction (what's the attacker trying to do, why it matters)
- The ThreatDown tree (in a code fence)
- A brief note on any `?` items or `[ ]` gaps that deserve attention

### 2. Coverage table

One table for the whole document, mapping primitives to attack classes, with status:

```markdown
| Primitive | Attacks it catches | Status |
|---|---|---|
| `#primitive-one` | attack-class-a, attack-class-b | shipped |
| `#primitive-two` | attack-class-c | specced |
```

### 3. Gap list

Every `[ ]` item collected, with an indication of priority (which attacks it leaves exposed).

### 4. Audit notes

Single points of failure (primitives that are the only mitigation for a critical attack), speculative paths that need verification, and any attack classes where the coverage feels thin.

## Relationship to the architecture

The threat model comes first. The architecture comes from the threat model. This is the inversion of how most systems are designed.

Typical flow:
1. Build the system based on requirements
2. Try to make it secure
3. Discover the architecture can't support the security properties you need
4. Retrofit or accept gaps

Threat-model-first flow:
1. Enumerate the threats the system must resist
2. Identify structural properties that block each threat
3. Architect the system so those properties are load-bearing primitives
4. Build features on top of the secure substrate

In the threat-model-first approach, every architectural decision traces back to a specific attack it blocks. When someone asks "why do you have records with fact/data classification?" the answer is "because without it, LLM output can be used as authorization proof" — and that answer points at a specific row in the coverage table.

That's why the threat model is the architecture. Not because the architecture describes the threats, but because the threats drive the architecture.

## Checklist

Before calling a threat model complete:

- [ ] Every attack class applicable to the system has at least one tree
- [ ] Every method under every goal has at least one condition
- [ ] Every condition has at least one mitigation (or is explicitly marked as a gap)
- [ ] Every `?` has a note explaining what evidence would resolve it
- [ ] The coverage table lists every `[x]` primitive exactly once
- [ ] Composite defenses (`&` groups) appear in the coverage table as one row per group, not per component
- [ ] Every `&` group has a description explaining why the parts are inseparable (can't be refactored into independent `+` alternatives)
- [ ] The coverage table shows no critical attack relying on a single mitigation
- [ ] Every mitigation tag is used consistently across all trees
- [ ] Structural mitigations outnumber procedural ones
- [ ] A reviewer who doesn't know the system can read the trees and understand what's defended and what isn't
