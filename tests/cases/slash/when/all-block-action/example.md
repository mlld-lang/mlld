/var @hasLicense = "true"
/var @isActive = "yes"
/var @isPaid = "1"

# && with block action - executes if ALL conditions match
/when (@hasLicense && @isActive && @isPaid) => show "Full access enabled"
