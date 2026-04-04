# Guard Import Export

/import "./guard-import-export-module.mld" as @guards
/import { @moduleSecretShield } from "./guard-import-export-module.mld"

/var secret @apiKey = "sk-module-123"

/show `Selected: @moduleSecretShield`
/show `Namespace: @guards.moduleSecretShield`
/show @apiKey with { guards: { except: [@moduleSecretShield] } }
/show @apiKey
