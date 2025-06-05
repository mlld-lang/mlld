# Testing Fixed Imports

@import { imported_title, role, codecat, echo } from "./imports-fixed.mld"

## Title: 
@add @imported_title

## Roles Available: 
- Architect: @add @role.architect
- UX: @add @role.ux  
- Security: @add @role.security

## Test the echo function:
@add @echo("Hello World")

## Note: codecat function available for: @run @codecat("./src")