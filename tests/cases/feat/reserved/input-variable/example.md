# @input Reserved Variable Test

This tests the @input reserved variable with various usage patterns.

## Direct Usage
/show @input

## Template Usage
/var @greeting = `Received input: @input`
/show @greeting

## Import from @input
/import { @config } from "@input"
/show @config

## Import again from @input
/import { @data } from "@input"
/show @data