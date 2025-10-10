# Force static (embed)
/import static <https://example.com/data.json> as @data

# Force live (always fresh)
/import live <./config.mld> as @config

# Force cached with TTL
/import cached(30m) <@company/utils.mld> as @utils

# Force local dev
/import local { @helper } from @alice/utils