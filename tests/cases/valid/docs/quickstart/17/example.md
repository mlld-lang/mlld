/var @isProduction = true
/var @debugMode = false
/var @userCount = 150

# Logical operators
/var @canDeploy = @isProduction && !@debugMode
/show @canDeploy

# Comparison operators  
/var @needsUpgrade = @userCount > 100
/show @needsUpgrade

# Ternary operator
/var @environment = @isProduction ? "prod" : "dev"
/show `Running in @environment environment`

# Complex expressions
/when (@userCount > 100 && @isProduction) || @debugMode => show "High-load monitoring enabled"