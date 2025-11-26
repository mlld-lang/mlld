/var @hasLicense = "true"
/var @isActive = "yes"
/var @isPaid = "1"

# Using && operator instead of deprecated 'all' modifier
/when (@hasLicense && @isActive && @isPaid) => show "Full access enabled"
