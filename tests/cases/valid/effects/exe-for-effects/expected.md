# Test effects streaming from exe functions with for loops

This test verifies that effects are emitted immediately when exe functions
contain for loops, not buffered until the for loop completes.

## Basic exe-for function

Start exe-for test
Processing: A
Processing: B
Processing: C

End exe-for test
## Exe-for with pipeline

Start pipeline test
Step1: X
Step2: processed-X
Step1: Y
Step2: processed-Y

End pipeline test
## Results

Result: Processing: A
Result: Processing: B
Result: Processing: C

Pipeline result: final-processed-X
Pipeline result: final-processed-Y