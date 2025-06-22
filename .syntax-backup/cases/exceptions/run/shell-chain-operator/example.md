---
name: run-shell-chain-operator
description: Shell chain operators should be rejected
---

# Test shell chain operators

This should fail because && is a chain operator outside quotes:

@run [(echo hello && echo world)]