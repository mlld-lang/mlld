/var @isDev = true
/var @isProd = false

/var @config = @isDev ? "development.json" : "production.json"
/var @logLevel = @isProd ? "error" : "debug"

/show "Config: @config"
/show "Log Level: @logLevel"