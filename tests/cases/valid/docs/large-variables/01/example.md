>> This fails with large data
/run {grep "TODO" "@largefile"}

>> This works with any size  
/run sh (@largefile) { echo "$largefile" | grep "TODO" }