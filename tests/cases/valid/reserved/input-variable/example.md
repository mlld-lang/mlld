# @INPUT Reserved Variable Test

This tests the @INPUT reserved variable with various usage patterns.

## Direct Usage
Input content: @add @INPUT

## Lowercase Alias
Input lowercase: @add @input

## Template Usage
/text @greeting = [[Received input: {{INPUT}}]]
/add @greeting

## Import from @INPUT
/import { config } from @INPUT

Config value: @add @config

## Import from lowercase
/import { data } from @input

Data value: @add @data