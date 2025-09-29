# Pipeline Inline Log Test

Testing that | log writes to stderr only.

/show "Document start"
/var @ignored = "stage" | log "This goes to stderr"
/show "Document end"

