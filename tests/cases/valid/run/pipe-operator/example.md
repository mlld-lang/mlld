---
name: pipe-operator
description: Single pipe operator should be allowed for command chaining
---

# Test single pipe operator

Single pipe | is allowed for piping output between commands:

/run {echo "hello world" | grep "world"}
/run {cat /etc/passwd | head -5}
/run {ls -la | grep ".md"}
/run {echo "test data" | sed 's/test/sample/'}

# Multiple pipes
/run {ps aux | grep node | head -10}