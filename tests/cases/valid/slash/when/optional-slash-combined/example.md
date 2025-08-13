/var @isProduction = "true"
/var @appName = "MyApp"

# Test multiple /when actions with optional slashes
/when @isProduction => [
  show `Deploying @appName to production...`
  run {echo "Building production bundle"}
  output "Deployment started" to stdout
]