# Export: Accessing Unexported Variable Should Error

This tests that accessing an unexported variable throws an error.

/import "./export-unexported-access-module.mld" as @utils
/show @utils._internalHelper
