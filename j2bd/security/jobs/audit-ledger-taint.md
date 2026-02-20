# Job (DRAFT): Audit Ledger and File Taint Forensics

## Scenario

I need to investigate how sensitive data moves through a workflow. I want a durable ledger of security events and proof that file reads inherit taint from prior writes.

## The Core Problem

Security events are invisible without a ledger. File reads that lose taint break provenance tracking and allow sensitive data to appear clean.

## The Solution

Use `.mlld/sec/audit.jsonl` as an append-only ledger, and confirm that read operations inherit taint recorded by prior write events.

## Key Atoms Needed

- audit-log
- labels-sensitivity
- labels-source-auto
- label-tracking
- policy-label-flow

## Relevant Spec Sections

- Part 12: Audit Ledger
- Part 1: Labels (The Foundation)
- Part 3: Policy (Declarative Controls)

## Success Criteria

### Phase 1: Documentation

- [ ] audit-log atom documents event types and fields
- [ ] labels-sensitivity atom shows secret label propagation
- [ ] label-tracking atom covers taint inheritance across file I/O

### Phase 2: Implementation

- [ ] Write a labeled value to disk
- [ ] Read the file and confirm taint/labels are present
- [ ] Query audit.jsonl for the corresponding write event

### Phase 3: Verification & Remediation

- [ ] Confirm `write` events record path, taint, and writer
- [ ] Confirm read values inherit taint from the latest write
- [ ] Note any missing event types or missing fields

### Exit Criteria

The audit ledger provides a clear, queryable history, and file taint propagation is visible through both labels and audit entries.

## Example Code (Target)

```mlld
var secret @token = "sk-live-123"
output @token to "audit-ledger-demo.txt"

var @loaded = <audit-ledger-demo.txt>
show @loaded.mx.labels

var @audit = <@base/.mlld/sec/audit.jsonl>
exe @findWrite(events) = js {
  return events.find(event => event.event === "write" && event.path.endsWith("audit-ledger-demo.txt"));
}
var @writeEvent = @findWrite(@audit)
show `Write event: @writeEvent.event`
```
