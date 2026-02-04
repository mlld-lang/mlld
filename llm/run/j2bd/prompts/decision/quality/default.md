## Quality Bar: Default

This run uses the default quality bar (`--polish false`).

### Completion Requirements

1. All five phases must have been executed (documentation, implementation, verification, adversarial, final review)
2. Adversarial verification must have returned `status: "verified"` with ALL exit criteria items passing
3. Final review must have returned `status: "approved"` - confirming the work is categorically sound, not just test-passing
4. Any issues raised by the final reviewer must have been addressed

### Verification Checks

**Check the adversarial worker's `exit_criteria_results` array.** Each exit criteria item from the job must have `result: "PASS"`. If any show `FAIL`, the job is not done regardless of how many additional tests passed. Do not accept "15/15 tests pass" without verifying that the exit criteria items specifically passed using the mechanisms described in the job (not substitutes).

**The final review is the last gate.** The final reviewer assesses ALL code changes holistically and can reject work that passes tests but is narrowly patched, hacky, or doesn't categorically deliver what the documentation promises. If the final reviewer finds systemic issues, create tickets to address them and re-run the final review after fixes.