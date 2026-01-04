# Test /when with complex var assignments

/exe @buildConfig(env) = js { 
  return {
    "environment": env,
    "debug": true,
    "ports": [3000, 3001]
  };
}

/var @environment = "production"
/var @needsConfig = "true"

# Test object literal assignment in when
/when @needsConfig => var @config = {
  "name": "myapp",
  "version": "1.0.0",
  "settings": {
    "timeout": 30,
    "retries": 3
  }
}
/show `Config name: @config.name`
/show `Config timeout: @config.settings.timeout`

# Test array literal assignment in when
/when @needsConfig => var @servers = ["web1", "web2", "db1", "cache1"]
/show `Servers: @servers`

# Test mixed object with function calls
/when @environment: [
  "production" => var @fullConfig = {
    "base": @buildConfig(@environment),
    "servers": ["prod1", "prod2"],
    "features": {
      "cache": true,
      "logging": "info"
    }
  }
  "development" => var @fullConfig = {
    "base": @buildConfig("dev"),
    "servers": ["localhost"],
    "features": {
      "cache": false,
      "logging": "debug"
    }
  }
]

/show `Environment: @fullConfig.base.environment`
/show `Debug mode: @fullConfig.base.debug`
/show `Cache enabled: @fullConfig.features.cache`
/show `Servers: @fullConfig.servers`
