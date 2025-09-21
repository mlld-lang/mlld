>> This usually works automatically now, but explicit shell mode is recommended for clarity when dealing with large data
/run sh (@largefile) { echo "$largefile" | grep "TODO" }

>> This works with any size  
/run sh (@largefile) { echo "$largefile" | grep "TODO" }