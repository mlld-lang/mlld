/var @env = "production"
/var @user = "admin"
/var @expectedUser = "admin"
/var @debugMode = "off"

>> Equality checks
/when @env == "production" => show "Running in production mode\n"
/when @user == @expectedUser => show "User authenticated\n"

>> Inequality checks
/when @env != "development" => show "Not in development mode\n"
/when @debugMode != "on" => show "Debug mode is disabled\n"

>> Combined with logical operators
/when @env == "production" && @user == "admin" => show "Admin access in production\n"
/when @env != "test" && @env != "staging" => show "Not in test or staging\n"
