---
name: run-shell-redirect-operator
description: Shell redirection operators should be rejected
---

# Test shell redirect operator

This should fail because > is a redirect operator outside quotes:

@run [(echo hello > output.txt)]