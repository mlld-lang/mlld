/var @isProduction = "false"
/var @emptyString = ""
/var @hasValue = "yes"
/var @nullValue = ""
/var @trueValue = "true"
/var @falseValue = "false"
/var @zeroValue = "0"
/var @oneValue = "1"

# Testing negation in @when

/when !@isProduction => show "Not in production mode"
/when !@emptyString => show "Empty string is falsy"
/when !@hasValue => show "This should not appear"
/when !@nullValue => show "Null is falsy"
/when !@trueValue => show "This should not appear"
/when !@falseValue => show "False is falsy"
/when !@zeroValue => show "Zero is falsy"
/when !@oneValue => show "This should not appear"