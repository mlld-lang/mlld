# Multiline Bash Code

@run bash [(#!/bin/bash
# A more complex bash script
names=("Alice" "Bob" "Charlie")
for name in "${names[@]}"; do
  echo "Welcome, $name!"
done

# Math operations
result=$((5 + 3))
echo "5 + 3 = $result"
)]