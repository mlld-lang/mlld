# Variable When Expressions with Operators Test

Testing when expressions combined with logical and comparison operators in variable assignments.

## Setup
/var @userRole = "admin"
/var @hasPermission = true
/var @requestCount = 5
/var @maxRequests = 10
/var @isWeekend = false
/var @debugMode = true

## When expression with logical operators
/var @accessLevel = when: [
  @userRole == "admin" && @hasPermission => "full access"
  
  @userRole == "user" && @hasPermission && @requestCount < @maxRequests => "limited access"
  
  @userRole == "guest" || !@hasPermission => "read only"
  
  true => "no access"
]

Access level:
/show @accessLevel

## When expression with ternary operators in actions
/var @environment = "production"
/var @apiUrl = when: [
  @environment == "production" => @debugMode ? "https://api-debug.example.com" : "https://api.example.com"
  @environment == "staging" => "https://api-staging.example.com"
  true => "http://localhost:3000"
]

API URL:
/show @apiUrl

## When expression with complex conditions
/var @hour = 14
/var @dayOfWeek = "Saturday"
/var @isHoliday = false

/var @storeStatus = when: [
  @isHoliday => "closed for holiday"
  @dayOfWeek == "Sunday" => "closed"
  @dayOfWeek == "Saturday" && (@hour < 9 || @hour >= 17) => "closed"
  (@hour < 9 || @hour >= 20) => "closed"
  @hour >= 12 && @hour < 13 => "lunch break"
  true => "open"
]

Store status:
/show @storeStatus

## When expression with negation and compound conditions
/var @isAuthenticated = true
/var @isEmailVerified = false
/var @accountAge = 7

/var @canPost = when: [
  !@isAuthenticated => false
  @isAuthenticated && !@isEmailVerified && @accountAge < 30 => false
  @isAuthenticated && (@isEmailVerified || @accountAge >= 30) => true
  true => false
]

Can post:
/show @canPost

## Complex parentheses precedence
/var @userType = "premium"
/var @trialActive = false
/var @paidUser = true
/var @betaFeature = true

/var @featureAccess = when: [
  (@userType == "premium" || @userType == "enterprise") && @paidUser => "all features"
  @betaFeature && (@userType == "premium" || @trialActive) => "beta access"
  !@paidUser && !@trialActive => "free tier"
  true => "standard access"
]

Feature access:
/show @featureAccess

## When expression with parentheses for precedence
/var @adminRole = true
/var @hasAuth = true
/var @ownerRole = false
/var @publicAccess = false

/var @accessType = when: [
  (@adminRole && @hasAuth) || @ownerRole => "full access"
  @publicAccess && !@ownerRole => "read only"
  (!@adminRole && !@hasAuth) && !@publicAccess => "no access"
  true => "limited access"
]

Access level:
/show @accessType

## When expression with null checks
/var @userProfile = { name: "Alice", email: 'alice@example.com' }
/var @fallbackEmail = 'noreply@example.com'

/var @contactEmail = when: [
  @userProfile.email != null => @userProfile.email
  @fallbackEmail != null => @fallbackEmail
  true => "no-email@example.com"
]

Contact email:
/show @contactEmail

## Nested when expressions with operators
/var @temperature = 25
/var @humidity = 60
/var @windSpeed = 15

/var @weatherFeelsLike = when: [
  @temperature > 30 && @humidity > 70 => "very hot and humid"
  @temperature > 25 && @windSpeed < 10 => "warm and still"
  @temperature < 10 && @windSpeed > 20 => "cold and windy"
  @temperature >= 18 && @temperature <= 25 && @humidity < 70 => "perfect"
  true => "typical"
]

Weather feels:
/show @weatherFeelsLike