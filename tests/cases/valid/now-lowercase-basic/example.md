# Basic time module test (lowercase)

## time as variable (returns text)
/var @timestamp = @time
/show `Variable time: @timestamp`

## time as import with common formats
/import { iso, unix, date as dateStr } from @time
/show `ISO: @iso`
/show `Unix: @unix`
/show `Date: @dateStr`