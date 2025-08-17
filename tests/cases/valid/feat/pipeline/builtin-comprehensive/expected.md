# Comprehensive Pipeline Builtin Tests

This test verifies all patterns of builtin commands (show, log, output) in pipelines, including implicit @input, explicit @input, field access, and template interpolation.

## Test 1: Bare commands (implicit @input)

Hello World

## Test 2: Explicit @input

Explicit Test

## Test 3: Field access with objects

Name: Bob, City: NYC

## Test 4: Template interpolation with context

User alice123 (ID: 123) has input: {"id":123,"username":"alice123"}

## Test 5: Chained builtins

Pipeline Data

## Test 6: Arrays and indexing

["first","second","third"]

First item: first

## Test 7: Complex templates with multiple references

Product Widget costs $19.99 (Stock: 42)

## Test 8: Output variations

All tests completed!
