/var @isAdmin = false
/var @isModerator = true
/var @isVerified = false

# Test when at least one condition is true
/when @isAdmin || @isModerator || @isVerified => show "Access granted"