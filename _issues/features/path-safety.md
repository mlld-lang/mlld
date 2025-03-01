`@embed [examples/example-import.meld]`
I'm using this in `examples/api-demo.meld` and it _appears_ to work (or at least there's no error about it)

this should be throwing an invalid syntax error because it's a path that contains a `/` but doesn't start with $ or `http/https`

we should add this extra check as a pathsecurity check when a path is transformed --- that will also let us cover the case where we see someone try something sneaky like
```
@text safevar = "../../id_rsa"
@embed [$path/{{safevar}}]
```