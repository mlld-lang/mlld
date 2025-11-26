/var @user = { "role": "guest", "verified": false }

/var @isAdmin = ""
/var @isModerator = ""
/var @isVerified = ""

# Using || operator instead of deprecated 'any' modifier
/when (@isAdmin || @isModerator || @isVerified) => show "Access granted"
