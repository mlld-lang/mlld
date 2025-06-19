# Test: @add @variable inside @when actions

This test verifies that simple variable references work correctly inside @when actions.

## Setup
@text greeting = "Hello from a text variable"
@text template = [[Hello from a template with {{greeting}}]]
@data config = { "message": "Hello from data" }

## Test 1: Direct @add (baseline - should work)
@add @greeting
@add @template
@add @config

## Test 2: Inside @when actions (currently fails)
@data isTrue = true
@when @isTrue => @add @greeting
@when @isTrue => @add @template
@when @isTrue => @add @config

## Test 3: Inside @when first: actions
@text testValue = "false"

@when @testValue first: [
  false => @add "Won't show"
  true => @add @greeting
]

## Test 4: Mixed with exec invocations
@exec greet(name) = [[Hello, {{name}}!]]
@text simpleVar = "Simple value"

@when @isTrue => @add @greet("Alice")
@when @isTrue => @add @simpleVar