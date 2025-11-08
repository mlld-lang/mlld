# Executables imported from modules retain security metadata

/import { greeter } from "security-exe-module.mld"

/show `Direct greeting: @greeter("Ada Lovelace")`
/var @templateLine = `Template greeting: @greeter("Grace Hopper")`
/show @templateLine
