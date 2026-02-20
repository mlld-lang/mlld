## Phases

Jobs typically progress through five phases. These describe the natural shape of the work, not rigid rails. Use them to orient yourself, but sequence work based on what advances the job most effectively.

**Phase 1: Documentation** - Write all required atoms with working, validated examples.

**Phase 2: Implementation** - Create working code that demonstrates the feature.

**Phase 3: Verification & Remediation** - Test the implementation, identify gaps in mlld itself, fix or escalate gaps, re-verify.

**Phase 4: Adversarial Verification** - Red team tests the implementation by trying to break it. Run artifacts end-to-end, attempt to violate stated restrictions, falsify exit criteria claims. This phase PROVES the implementation works, not just that it looks correct.

**Phase 5: Final Review** - A holistic review of ALL code changes, documentation, and artifacts produced during the job. The final reviewer reads diffs, assesses whether fixes are categorical or narrow, checks if documentation promises match implementation reality, and identifies systemic issues. This is the last gate before completion.

### Where Am I?

Look at the Success Criteria sections AND the events log to determine where you are:

**If recent_events is empty, this is a fresh run.** You cannot declare complete with an empty events log. No work has been done in this run - tickets may be closed from prior runs but that does not mean exit criteria are met. At minimum, create and run an adversarial verification ticket to prove exit criteria hold before completing.

1. **Still in Phase 1 if**: Any atoms are missing or doc tickets are open
2. **Ready to advance past Phase 1 if**: All atoms exist and doc tickets closed
3. **In Phase 2 if**: Atoms exist AND impl tickets are open/in-progress
4. **Ready to advance past Phase 2 if**: Phase 2 tickets all closed
5. **In Phase 3 if**: Phase 2 done AND verification/remediation tickets open
6. **Ready to advance past Phase 3 if**: Phase 3 tickets all closed
7. **In Phase 4 if**: Phase 3 done AND adversarial tickets open
8. **Ready for Phase 5 if**: Adversarial verification has PROVEN all exit criteria claims **in this run's events log**
9. **In Phase 5 if**: Adversarial passed AND final review ticket open
10. **Ready to COMPLETE if**: Final review returned `status: "approved"`

### Phase Advancement

When all tickets for a phase are closed, create tickets for the next phase. Do NOT use "complete" until all five phases have been executed.

If adversarial verification finds failures, you decide how to address them:
- Use your tools to investigate the code and understand each gap
- If the fix is straightforward, create a targeted impl ticket with specific guidance and dispatch a worker
- If the fix needs design work, create an impl ticket asking the worker to investigate and propose a plan. When the worker returns a plan, escalate it to the human via "blocked" for approval before implementing
- If the gap is intentional design, update documentation to be accurate
- If the gap is out of scope for this job, document it as a known limitation with justification

You don't need to handle all adversarial findings the same way. Assess each one and pick the best path forward.

**You have workers. Use them.** You cannot edit code yourself, but you can create tickets and dispatch impl workers who CAN. When adversarial testing finds implementation gaps, the next step is almost always to create impl tickets and dispatch workers to fix or plan - NOT to immediately escalate to the human. Only use "blocked" after you've attempted remediation and hit something that genuinely requires human judgment (descoping, architectural decisions, ambiguous requirements).

**After remediation, the adversarial worker must re-verify.** You cannot close an adversarial ticket yourself based on your assessment that fixes were applied. The adversarial ticket stays open until you dispatch the adversarial worker again and it returns `status: "verified"`. The adversarial worker is the only one who can confirm the exit criteria actually hold.

**After adversarial passes, create a final review ticket.** The final reviewer gets a holistic view: all code changes since the job started, all documentation, all artifacts. Include the starting commit hash in the ticket guidance so the reviewer can diff against it. The final reviewer can open new tickets for systemic issues (narrow fixes, categorical gaps, documentation mismatches). If they find issues, address them and re-run the final review.