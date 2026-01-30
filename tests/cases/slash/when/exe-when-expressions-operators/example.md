# Exe When Expressions with Operators Test

Testing when expressions combined with operators in exe definitions.

## Setup functions
/exe @isValidEmail(email) = js { 
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/exe @hasAccess(userRole, department) = js {
  if (userRole === "admin") return true;
  if (userRole === "manager" && department === "IT") return true;
  return false;
}

## Exe with operator-based conditions
/exe @validateUser(email, age, country) = when [
  !@isValidEmail(@email) => "Invalid email format"
  @age < 13 => "Too young to register"
  @age >= 13 && @age < 18 && @country != "US" => "Parental consent required"
  @age >= 18 || @age >= 13 && @country == "US" => "Registration allowed"
  true => "Unable to validate"
]

User validation:
/show @validateUser('test@example.com', 25, "UK")
/show @validateUser("invalid-email", 25, "UK")
/show @validateUser('teen@example.com', 15, "UK")
/show @validateUser('teen@example.com', 15, "US")

## Exe with complex access logic
/exe @getAccessLevel(userRole, department, isActive, hasTraining) = when [
  !@isActive => "inactive account"
  @userRole == "admin" && @hasTraining => "full admin access"
  @userRole == "admin" && !@hasTraining => "admin - training required"
  @userRole == "manager" && @department == "IT" && @hasTraining => "IT manager access"
  @userRole == "manager" && @department == "IT" => "IT manager - training required"
  @hasTraining => "basic access"
  true => "no access"
]

Access level checks:
/show @getAccessLevel("admin", "IT", true, true)
/show @getAccessLevel("admin", "IT", true, false)
/show @getAccessLevel("manager", "IT", true, true)
/show @getAccessLevel("manager", "HR", true, true)
/show @getAccessLevel("user", "Sales", true, true)
/show @getAccessLevel("user", "Sales", false, true)

## Exe with ternary in actions
/exe @formatStatus(code, verbose) = when [
  @code == 200 => @verbose ? "OK - Request successful" : "OK"
  @code == 404 => @verbose ? "Not Found - Resource does not exist" : "Not Found"
  @code >= 500 => @verbose ? "Server Error - Internal problem" : "Server Error"
  @code >= 400 => @verbose ? "Client Error - Bad request" : "Client Error"
  true => @verbose ? "Unknown status code" : "Unknown"
]

Status formatting:
/show @formatStatus(200, true)
/show @formatStatus(404, false)
/show @formatStatus(500, true)
/show @formatStatus(401, false)

## Exe with field access and comparisons
/exe @validateConfig(config, environment) = when [
  @config == null => "missing configuration"
  @config.version != "2.0" => "unsupported version"
  @environment == "production" && @config.debug == true => "debug mode not allowed in production"
  @environment == "development" && @config.secure != true => "security recommended for development"
  true => "configuration valid"
]

/var @prodConfig = { version: "2.0", debug: false, secure: true }
/var @devConfig = { version: "2.0", debug: true, secure: false }

Configuration validation:
/show @validateConfig(@prodConfig, "production")
/show @validateConfig(@devConfig, "development")

## Exe combining multiple operators
/exe @checkAccess(role, department, timeOfDay, isEmergency) = when [
  @isEmergency && (@role == "admin" || @role == "security") => "emergency access granted"
  @role == "admin" => "full access"
  @role == "manager" && @department == "IT" && (@timeOfDay >= 6 && @timeOfDay <= 22) => "department access"
  @role == "employee" && (@timeOfDay >= 9 && @timeOfDay <= 17) => "business hours access"
  @role == "contractor" && @department != "Restricted" && (@timeOfDay >= 9 && @timeOfDay <= 17) => "limited access"
  true => "access denied"
]

Access control:
/show @checkAccess("admin", "IT", 23, false)
/show @checkAccess("manager", "IT", 10, false)
/show @checkAccess("employee", "Sales", 16, false)
/show @checkAccess("contractor", "Restricted", 10, false)
/show @checkAccess("security", "Sales", 20, true)

## Exe with null coalescing patterns
/exe @getUserName(user, fallbackName) = when [
  @user == null => @fallbackName
  @user.name != null => @user.name
  @user.email != null => @user.email
  true => @fallbackName
]

/var @user1 = { name: "Alice", email: 'alice@example.com' }
/var @user2 = { email: 'bob@example.com' }
/var @user3 = null

Name resolution:
/show @getUserName(@user1, "Guest")
/show @getUserName(@user2, "Guest")
/show @getUserName(@user3, "Guest")

## Parentheses changing precedence
/exe @evaluateRisk(score, override, verified, premium) = when [
  @override && (@verified || @premium) => "override approved"
  @score > 80 || (@score > 60 && @premium) => "low risk"
  @score > 40 && (@verified || @override) => "medium risk"
  !@verified && (!@premium || @score < 20) => "high risk"
  true => "standard risk"
]

Risk evaluation:
/show @evaluateRisk(70, false, true, false)
/show @evaluateRisk(70, false, false, true)
/show @evaluateRisk(50, true, false, false)
/show @evaluateRisk(15, false, false, false)