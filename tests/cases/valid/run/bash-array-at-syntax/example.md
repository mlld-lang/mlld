# Bash Array @ Syntax Test

This tests how mlld handles bash's @ syntax for arrays, which conflicts with mlld's @ variable syntax.

## Basic Array Expansion

@run bash [(#!/bin/bash
# Test 1: Basic array with @ expansion
arr=("one" "two" "three")
echo "Array with @: ${arr[@]}"
echo "Array with *: ${arr[*]}"
echo "Array length: ${#arr[@]}"
)]

## Array in For Loop

@run bash [(#!/bin/bash
# Test 2: Array iteration using @
colors=("red" "green" "blue")
for color in "${colors[@]}"; do
  echo "Color: $color"
done
)]

## Mixed mlld and Bash @

@text myvar = "mlld variable"
@run bash [(#!/bin/bash
# Test 3: Bash @ and mlld @ in same context
bash_array=("item1" "item2")
echo "Bash array: ${bash_array[@]}"
echo "Mlld var: $myvar"
)]

## Edge Cases

@run bash [(#!/bin/bash
# Test 4: Various @ patterns
arr=("a" "b" "c")
# All these use @ in bash contexts
echo "${arr[@]:1:2}"    # slice from index 1, length 2
echo "${!arr[@]}"       # array indices
echo "${arr[@]/#/X}"    # prefix each element with X
echo "${arr[@]/%/Y}"    # suffix each element with Y
)]