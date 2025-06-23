# URL Support Demo

This example demonstrates how to use URLs in Meld directives.

## Import from URL
/import { * } from "https://raw.githubusercontent.com/example/repo/main/config.mld"

## Text from URL
/text @readme = [https://raw.githubusercontent.com/example/repo/main/README.md]

## Add content from URL
/add [https://raw.githubusercontent.com/example/repo/main/docs/getting-started.md]

## Path assignment with URL
/path @apiEndpoint = "https://api.example.com/v1"

## Complex data with URL-fetching directives
/data @projectInfo = {
  "readme": [https://raw.githubusercontent.com/example/repo/main/README.md],
  "version": @run {curl -s https://api.example.com/version},
  "apiBase": @apiEndpoint
}

## Using the API endpoint
/run {curl -s @apiEndpoint/users}

Note: To enable URL support, you have two options:

1. Use CLI flags:
meld url-demo.mld --allow-urls --url-allowed-domains github.com,githubusercontent.com,api.example.com

2. Create a meld.config.json file in your project:
   ```json
   {
     "security": {
       "urls": {
         "enabled": true,
         "allowedDomains": ["github.com", "raw.githubusercontent.com", "api.example.com"],
         "timeout": "30s",
         "maxSize": "10MB"
       }
     },
     "cache": {
       "urls": {
         "enabled": true,
         "defaultTTL": "5m",
         "rules": [
           { "pattern": "https://api.example.com/*", "ttl": "1m" },
           { "pattern": "*.md", "ttl": "1h" }
         ]
       }
     }
   }
   ```