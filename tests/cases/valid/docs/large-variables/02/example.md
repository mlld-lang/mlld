>> Load entire codebase (could be megabytes)
/var @allCode = <**/*.js>

>> Previously, this could error if @allCode > 128KB. mlld now auto-falls back to shell when needed.
/run sh (@allCode) { echo "$allCode" | wc -l }