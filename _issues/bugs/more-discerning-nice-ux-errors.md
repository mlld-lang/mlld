Our "nice UX" versions of our errors that output where an issue is taking place will show up even when the error is that the file isn't even processing. This actually leads to a confusing user experience.

See below:

_ Error: Output error (markdown): Failed to convert to markdown
    at examples/output.meld:1:1

   1 | >> This is a commment and should be ignored
      ^
   2 | >> I can write a couple lines of them if I want and no one will ever know.
   3 | 

In this case, the error had nothing to do with the content, which is why it's saying the error originated at 1:1

We need a more discerning way of handling these so that the error is suppressed if it's not relevant

We really need to design a better more modular way of handling all our output errors. We get a lot of duplicate errors still, and when we tried to suppress those, we ended up killing off our ability to get certain outputs that we wanted.

We need to step back and look at creating an entire service for handling stdout/stderr output and integrate it with our logger and anything that we output. Right now it's a bit of a free for all in terms of what goes to the console and we end up having to chase down random temporarily-added debug output to get it out of production.