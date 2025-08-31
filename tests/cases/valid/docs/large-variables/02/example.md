>> Load entire codebase (could be megabytes)
/var @allCode = <**/*.js>

>> This will error if @allCode > 128KB
/run {wc -l "@allCode"}

>> This works with any size
/run sh (@allCode) { echo "$allCode" | wc -l }