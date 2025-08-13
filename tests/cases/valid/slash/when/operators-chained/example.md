/var @isUser = true
/var @isActive = true
/var @hasPermission = true
/var @isAdmin = false

>> Chained AND conditions
/when @isUser && @isActive && @hasPermission => show "Access granted (user path)\n"

>> Chained OR conditions
/when @isAdmin || @isUser && @isActive => show "Access granted (admin or active user)\n"

>> Complex chaining
/var @isGuest = false
/var @hasTrialAccess = true
/when @isAdmin || @isUser && @isActive || @isGuest && @hasTrialAccess => show "Access granted (complex)\n"

>> Test with some false values
/var @condition1 = false
/var @condition2 = false
/var @condition3 = true
/var @condition4 = false

/when @condition1 || @condition2 || @condition3 || @condition4 => show "At least one condition is true\n"
