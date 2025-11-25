stream /exe @task1() = run { sleep 2 && echo "Task 1 done" }
stream /exe @task2() = run { sleep 1 && echo "Task 2 done" }

/for 2 parallel @i in [1, 2] => @task@i()
# Both tasks stream output as they complete