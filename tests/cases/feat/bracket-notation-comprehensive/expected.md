# Bracket Notation Comprehensive Test

Test bracket notation across all major contexts to ensure universal support.

## Test Data Setup

## 1. Variable Assignment Context (/var)

### Static String Keys

### Dynamic Variable Keys  

## 2. Show Directive Context (/show)

### Static String Keys
simple-value
inner-value
spaced-value
numeric-key-value
### Dynamic Variable Keys
simple-value
inner-value
## 3. Backtick Template Context

### Static String Keys
Simple: simple-value
Nested: inner-value
Spaced: spaced-value
Numeric: numeric-key-value
### Dynamic Variable Keys  
Dynamic: simple-value
Nested Dynamic: inner-value
## 4. Executable Arguments Context

### Static String Keys
Received: simple-value
Received: inner-value
Received: spaced-value
Received: numeric-key-value
### Dynamic Variable Keys
Received: simple-value
Received: inner-value
## 5. Mixed Notation (Dot + Bracket)

inner-value
## 6. Results Verification

All of the above should output the expected values:
- simple-value (multiple times)
- inner-value (multiple times)  
- spaced-value
- dashed-value
- numeric-key-value
