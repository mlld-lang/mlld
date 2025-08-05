/var @userConfig = null
/var @defaultConfig = "default.json"

>> Using || for default values
/var @config = @userConfig || @defaultConfig

/show "Config: @config"