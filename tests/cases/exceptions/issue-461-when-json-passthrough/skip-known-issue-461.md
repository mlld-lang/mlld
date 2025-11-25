Bug #461: when expression loses JSON/structured data

When JSON or structured data is returned from a when [ ] expression
via `* => @variable`, the data is lost and becomes empty.

This is a blocking issue with no easy workaround.
The user found that adding `| @json` after each when step
helps but breaks retry logic.

https://github.com/mlld-lang/mlld/issues/461
