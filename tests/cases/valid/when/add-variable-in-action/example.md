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
/when @isTrue => @show @greeting
/when @isTrue => @show @template
/when @isTrue => @show @config

## Test 3: Inside @when first: actions
/var @testValue = "false"

/when @testValue first: [
true => @show "Won't show"
false => @show @greeting
]

## Test 4: Mixed with exec invocations
/exe @greet(name) = [[Hello, {{name}}!]]
/var @simpleVar = "Simple value"

/when @isTrue => @show @greet("Alice")
/when @isTrue => @show @simpleVar