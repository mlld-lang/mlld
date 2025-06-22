/data @user = { "role": "guest", "verified": false }

/text @isAdmin = ""
/text @isModerator = ""
/text @isVerified = ""

/when any: [
  @isAdmin
  @isModerator
  @isVerified
] => @add "Access granted"