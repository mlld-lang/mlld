# Comprehensive Test for Optional Slashes in RHS Contexts

This test verifies that slashes are optional in all RHS contexts while producing identical output.

## Setup
/var @env = "production"
/var @buildComplete = "true"

## Var Assignment with /run
/var @timestamp = /run {echo "2024-01-15"}
/var @version = /run {echo "v2.0.0"}

## Exe Definitions with /run
/exe @build() = /run {echo "Building application..."}
/exe @deploy() = /run {echo "Deploying to server..."}

## When Actions with Slashes
/when @buildComplete => /show `Build completed for @env`
/when @buildComplete => /run {echo "Starting deployment process..."}
/when @buildComplete => /output "Deployment initialized" to stdout

## Execution
/show `[@timestamp] Application version: @version`
/show `[INFO] Deployment to @env started`