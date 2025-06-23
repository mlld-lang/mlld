# Test: @add @variable inside @when actions

This test verifies that simple variable references work correctly inside @when actions.

## Setup
/var @greeting = "Hello from a text variable"
/var @template = [[Hello from a template with {{greeting}}]]
/var @config = { "message": "Hello from data" }

## Test 1: Direct @add (baseline - should work)
/show @greeting
/show @template
/show @config

## Test 2: Inside @when actions (currently fails)
/var @isTrue = true
/when @isTrue => @add @greeting
/when @isTrue => @add @template
/when @isTrue => @add @config

## Test 3: Inside @when first: actions
/var @testValue = "false"

/when @testValue first: [
true => @add "Won't show"
false => @add @greeting
]

## Test 4: Mixed with exec invocations
/exe @greet(name) = [[Hello, {{name}}!]]
/var @simpleVar = "Simple value"

/when @isTrue => @add @greet("Alice")
/when @isTrue => @add @simpleVar