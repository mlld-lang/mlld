# /run stdin support

/var @rawPayload = '{"name": "Ada", "value": 42}'

>> Direct with-clause stdin should avoid quoting
/run { cat } with { stdin: @rawPayload }

/var @formatted = run { cat } with { stdin: @rawPayload, pipeline: [@json] }
/show @formatted

>> Pipe sugar should behave identically
/run { cat } with { stdin: @rawPayload }

/var @pipeFormatted = run { cat } with { stdin: @rawPayload, pipeline: [@json] }
/show @pipeFormatted
