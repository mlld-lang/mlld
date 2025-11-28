>> Get all of a specific type
/var @allFunctions = <service.ts { *fn }>       # All functions and methods
/var @allVariables = <service.ts { *var }>      # All variables and constants
/var @allClasses = <service.ts { *class }>      # All classes
/var @everything = <service.ts { * }>           # All top-level definitions

>> Other supported types
{ *interface }  # All interfaces
{ *type }       # All type aliases
{ *enum }       # All enums
{ *struct }     # All structs (Go, Rust, C++)
{ *trait }      # All traits (Rust)
{ *module }     # All modules (Ruby)