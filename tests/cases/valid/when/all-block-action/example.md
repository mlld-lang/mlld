/text @hasLicense = "true"
/text @isActive = "yes"
/text @isPaid = "1"

# all: with block action - executes if ALL conditions match
/when @hasLicense all: [
  @hasLicense
  @isActive
  @isPaid
] => @add "Full access enabled"