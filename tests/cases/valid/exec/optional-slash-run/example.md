# Test /exe with /run (optional slash)
/exe @build(env) = /run {echo "Building for @env environment"}
/exe @deploy() = /run {echo "Deploying application"}

# Execute the commands
/run @build("production")
/run @deploy()