/var @hasLicense = "true"
/var @isActive = "yes"
/var @isPaid = "1"

# all: with block action - executes if ALL conditions match
/when @hasLicense all: [
  @hasLicense
  @isActive
  @isPaid
] => show "Full access enabled"