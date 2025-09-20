# Test: show @variable inside /when actions

This test verifies that simple variable references work correctly inside /when actions.

## Setup

## Test 1: Direct /show (baseline - should work)
Hello from a text variable
Hello from a template with Hello from a text variable
{"message": "Hello from data"}
## Test 2: Inside /when actions (currently fails)

Hello from a text variable

Hello from a template with Hello from a text variable

{"message": "Hello from data"}

## Test 3: Inside /when first: actions

Hello from a text variable
## Test 4: Mixed with exec invocations

Hello, Alice!

Simple value