# Output Directive Effects Test

Testing stdout/stderr routing with output directives

/show "This goes to both stdout and document"
/output "This goes only to stdout" to stdout
/show "Back to document"
/output "Error message" to stderr
/show "Final document line"