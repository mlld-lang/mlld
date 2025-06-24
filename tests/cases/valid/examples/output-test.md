# Output Management Test

This file tests the new output management features.

## Test 1: Progress Indicators

/run {echo "Starting process..."}
/run {sleep 1 && echo "Processing..."}
/run {echo "Complete!"}

## Test 2: Long Output (should truncate)

/run {seq 1 100}

## Test 3: Error Handling

### Halt Mode (comment out to test)
/var @mode = "Testing halt mode"
/run {echo "This runs"}
<!-- run {nonexistent-command} -->
/run {echo "This won't run if error above is uncommented"}

### Continue Mode
/run {echo "Starting continue mode test"}
/run {false}
/run {echo "This should still run even after error"}

## Test 4: Multiple Errors (for collection)

/run {echo "Task 1: Success"}
/run {exit 1}
/run {echo "Task 2: Success"} 
/run {exit 2}
/run {echo "Task 3: Success"}

## Test 5: Code Execution

/run javascript {console.log("JavaScript output test");
for (let i = 1; i <= 5; i++) {
console.log(`Line ${i}`);
}
}

## Done!

All tests complete.