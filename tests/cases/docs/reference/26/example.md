/import module { @env } from @mlld/env
/import static <./templates/system.mld> as @systemTemplates
/import live { @value } from @input
/import cached(5m) "https://api.example.com/status" as @statusSnapshot
/import local { @helper } from @local/dev-tools