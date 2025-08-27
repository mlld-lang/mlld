>> Load environment-specific config
/import { NODE_ENV } from @input
/var @env = @NODE_ENV || "development"

>> Load base config and environment overrides
/var @baseConfig = <config/base.json>
/var @envConfig = <config/@env.json>

>> Merge configurations using JS
/var @config = js {
  return Object.assign(
    {},
    @baseConfig.json,
    @envConfig.json,
    {
      environment: @env,
      timestamp: @now
    }
  )
}

/output @config to "runtime-config.json" as json