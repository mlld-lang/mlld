# Test that effects stream immediately in /var for loops

This test verifies that effects are emitted immediately during for loop
execution within /var assignments, not buffered until completion.

## Simple for loop in var assignment

Start var-for test
Processing: 1
Processing: 2
Processing: 3

End var-for test
Results: ["result-1","result-2","result-3"]
## For loop with side effects

Start tracking test
Item A at position 1
Item B at position 2
Item C at position 3

End tracking test
## Direct pipeline in var-for expression

Start direct pipeline test
Stage1: P
Stage2: s1-P
Stage3: s2-s1-P
Stage1: Q
Stage2: s1-Q
Stage3: s2-s1-Q

End direct pipeline test
Pipeline result: s3-s2-s1-P
Pipeline result: s3-s2-s1-Q