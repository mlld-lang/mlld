# Enhanced TIME Module - Format Tests

## Import various time formats using now.* syntax
/import { "YYYY-MM-DD" as todayCustom, "HH:mm:ss" as timeCustom } from @time
/import { iso, unix, date as dateFormat, time as timeFormat } from @time

## Show imported values
/show `Today (custom): @todayCustom`
/show `Time (custom): @timeCustom`
/show `ISO: @iso`
/show `Unix: @unix`
/show `Date: @dateFormat`
/show `Time: @timeFormat`