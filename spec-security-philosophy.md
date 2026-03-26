# mlld Security Philosophy

## The Core Bet

Prompt injection is not a detection problem. It's a consequence problem.

You cannot reliably stop LLMs from being tricked. An attacker who controls any data the LLM reads — email bodies, web pages, Telegram messages, file contents, API responses — can embed instructions that the LLM will follow. Every approach that tries to detect or filter injection is playing whack-a-mole against a fundamentally adversarial surface.

mlld's approach: assume injection will succeed. Make it so it doesn't matter. Track where data came from. Control where it can go. Require structural proof before allowing consequential actions. The LLM can be tricked into wanting to send secrets to an attacker's email — but the email address doesn't carry the right provenance, so the operation is denied. The attack fails not because we caught the injection, but because the data flow prevents the consequence.

This is information flow control applied to LLM orchestration. It's the same principle as Perl's taint mode, Rust's borrow checker, or capability-based security — make a class of bugs structurally impossible rather than asking developers to be careful.

## Separation of Concerns

mlld deliberately separates three activities:

1. **Building** — writing the agent/orchestrator
2. **Threatening** — analyzing what could go wrong
3. **Securing** — adding the security layer

These are different tasks, done at different times, possibly by different people (or different LLM sessions). The language design enforces this separation: security primitives (policies, guards, records, facts) are declarative overlays on top of orchestration code, not interleaved with it.

This is intentional and load-bearing. If security logic is mixed into orchestration code — as it is in every other LLM framework — you can't reason about either independently. You can't generate the security layer without rewriting the application. You can't audit security without reading the whole codebase. You can't update the threat model without touching business logic.

By keeping them separate, each layer is independently writable, auditable, and replaceable.

## The Flow: Build, Threaten, Secure

### 1. Build it without thinking about security

Write your agent. Wire up your data sources. Define your exes, stores, records. Make it do the thing.

mlld is designed to make this fast and concise. The language is small. LLMs can one-shot working agents in it. Claude co-designed mlld's syntax through hundreds of iterations based on friction points — the goal is that an LLM can produce correct mlld on the first try, and a human can read it without a manual.

At this stage, don't think about attacks. Don't think about what could go wrong. Just make it work.

### 2. Threaten it

Now step back and ask: what could go wrong?

This is threat modeling. For an LLM agent, the key questions are:

- **What data sources are untrusted?** Anything an attacker could influence: email bodies, web content, user-submitted text, API responses from third parties, chat messages.
- **What operations are dangerous?** Sending emails, deleting files, making payments, deploying code, modifying permissions, calling external APIs.
- **What are the attack paths?** How could an attacker get untrusted data to flow into a dangerous operation? Could a malicious email convince the agent to forward secrets? Could a web page trick the agent into running a destructive command?
- **What fields are authoritative?** Which return values from which tools can be trusted for authorization decisions? Contact emails from your contacts API — yes. Email addresses mentioned in email bodies — no.

This analysis produces a structured threat model: data sources, trust levels, dangerous operations, attack paths, field-level trust classifications.

The threat modeling step can be LLM-assisted. An LLM can analyze the agent code, identify data sources and operations, and produce a structured threat model. This is exactly the kind of structured reasoning LLMs are good at — they can see patterns like "this email body flows into this send operation" that a human might miss.

### 3. Secure it

Take the threat model and turn it into mlld security primitives:

- **Records** declare which fields are facts vs data, with conditional trust based on field values. The threat model says "contact emails are authoritative but bios are attacker-controlled" → the record declares `facts: [email, name]` and `data: [bio]`.

- **Policies** set baseline rules. The threat model says "email recipients must be known contacts" → the policy includes `no-send-to-unknown`. "MCP data shouldn't reach destructive operations" → add a label flow deny rule.

- **Guards** punch surgical holes for specific scenarios. The threat model says "secret documents can go to internal contacts but not external ones" → a guard checks `fact:internal:@contacts.email` before allowing it.

- **Facts** flow as labels through the existing taint system. No new enforcement mechanism — just richer inputs to the policy and guard checks that already exist.

Each of these artifacts is declarative. An LLM can generate them from the threat model. A human can review them without reading the orchestration code. They can be updated independently when the threat model changes.

### 4. Test it adversarially

The threat model identifies attack paths. Turn those into an adversarial test suite that actually tries the attacks:

- Inject a malicious email address via a Telegram message. Does the agent send to it? (Should fail: no fact label.)
- Embed "ignore previous instructions" in a web page the agent reads. Does the agent follow it? (Should fail: web-sourced data blocked from dangerous operations.)
- Put a fake contact email in an email body. Does the agent treat it as authoritative? (Should fail: email body is `data`, not `fact`.)

Each test case corresponds to an attack path in the threat model. The suite proves the security layer actually stops the attacks — not just that it was declared, but that it works.

This closes the loop: build → threaten → secure → prove.

## Why This Works for Adoption

The traditional approach asks every developer to be a security expert. mlld asks developers to build their agent, then lets LLMs help with the security analysis and generation.

The developer's expertise is in the domain: "I need an agent that manages outreach using contacts, CRM, and email." The security expertise is in the framework: "data from Telegram is untrusted, email recipients need to be facts, secret content can only go to internal contacts." mlld's declarative security primitives are exactly the kind of structured output LLMs can generate from a threat analysis.

The separation of concerns makes this practical:
- Build: developer (or LLM) writes orchestration
- Threaten: LLM analyzes the agent and produces a threat model
- Secure: LLM generates records, policies, guards from the threat model
- Test: LLM generates adversarial test suite from the threat model

At no point does the developer need to manually interleave security logic with business logic. The security layer is an overlay — added, audited, and tested independently.

## What mlld Does Not Do

mlld does not try to detect prompt injection. It does not scan inputs for suspicious patterns. It does not filter outputs for harmful content. Those approaches are heuristic, bypassable, and fundamentally incomplete.

mlld makes prompt injection irrelevant by controlling consequences. The LLM can be tricked. The data flow prevents the trick from causing harm. That's a structural guarantee, not a best-effort filter.
