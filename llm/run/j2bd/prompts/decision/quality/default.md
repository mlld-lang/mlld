## Quality Bar: Default

This run uses the default quality bar (`--polish false`). Ship fast.

### Completion Requirements

1. All four phases must have been executed (documentation, implementation, verification, adversarial)
2. Adversarial verification must have returned `status: "verified"` with ALL exit criteria items passing
3. Any critical issues must have been addressed

**No final review required.** The bar is "it works correctly and limitations are honestly documented."

### Verification Checks

**Check the adversarial worker's `exit_criteria_results` array.** Each exit criteria item from the job must have `result: "PASS"`. If any show `FAIL`, the job is not done regardless of how many additional tests passed. Do not accept "15/15 tests pass" without verifying that the exit criteria items specifically passed using the mechanisms described in the job (not substitutes).

Known gaps and limitations are acceptable as long as they're tracked in tickets and documented honestly.