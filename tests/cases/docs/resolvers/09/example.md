# These all resolve differently
/import { @x } from @alice/utils          # Registry resolver
/import local { @x } from @alice/utils    # Local dev resolver
/import <@notes/utils.mld> as @x          # Custom @notes/ resolver