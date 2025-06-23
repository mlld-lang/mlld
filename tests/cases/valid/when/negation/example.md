/var @isProduction = "false"
/var @emptyString = ""
/var @hasValue = "yes"
/var @nullValue = null
/var @trueValue = true
/var @falseValue = false
/var @zeroValue = 0
/var @oneValue = 1

# Testing negation in @when

/when !@isProduction => @add "Not in production mode"
/when !@emptyString => @add "Empty string is falsy"
/when !@hasValue => @add "This should not appear"
/when !@nullValue => @add "Null is falsy"
/when !@trueValue => @add "This should not appear"
/when !@falseValue => @add "False is falsy"
/when !@zeroValue => @add "Zero is falsy"
/when !@oneValue => @add "This should not appear"