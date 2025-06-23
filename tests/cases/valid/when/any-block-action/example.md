/var @isAdmin = ""
/var @isModerator = "true"
/var @isVerified = ""

# any: with block action - executes if ANY condition matches
/when @isAdmin any: [
  @isAdmin
  @isModerator
  @isVerified
] => @add "Access granted"