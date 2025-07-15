# @input Reserved Variable Test

This tests the @input reserved variable with various usage patterns.

## Direct Usage
Input content: /show @input

## Template Usage
/var @greeting = :::Received input: {{input}}:::
/show @greeting

## Import from @input
/import { config } from @input

Config value: /show @config

## Import again from @input
/import { data } from @input

Data value: /show @data