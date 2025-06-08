---
name: run-shell-background-operator
description: Shell background operator should be rejected
---

# Test shell background operator

This should fail because & is a background operator outside quotes:

@run [(sleep 5 &)]