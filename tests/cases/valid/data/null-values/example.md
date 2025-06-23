/data @config = {
name: "TestApp",
version: "1.0.0",
description: null,
settings: {
debug: false,
logLevel: null,
features: {
auth: true,
cache: null,
api: "v2"
    }
  },
metadata: null
}

/add [[Application Config:
Name: {{config.name}}
Version: {{config.version}}
Description: {{config.description}}
Debug: {{config.settings.debug}}
Log Level: {{config.settings.logLevel}}
Auth: {{config.settings.features.auth}}
Cache: {{config.settings.features.cache}}
API: {{config.settings.features.api}}
Metadata: {{config.metadata}}]]