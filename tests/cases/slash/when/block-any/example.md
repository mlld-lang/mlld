/var @user = { "role": "guest", "verified": false }

/var @isAdmin = ""
/var @isModerator = ""
/var @isVerified = ""

/when (@isAdmin || @isModerator || @isVerified) => show "Access granted"
