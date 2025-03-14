Requiring all paths to be $var rooted by default is ultimately troublesome and confusing UX that inhibits pure discovery. 

Further, it's part of a set of security policy features that ultimately were not prioritized for the first release of mlld.

Rather than trying to restrict what paths you can use where in the syntax, let's simplify our path validation and eliminate such requirements so that @path variables are just a UX feature.

When we later have a security policy layer, we can bring this concept back in and revisit it.