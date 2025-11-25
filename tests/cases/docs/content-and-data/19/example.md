/var @post = <blog/post.md>

/show @post.ctx.fm.title                 >> Post title
/show @post.ctx.fm.author                >> Author name
/show @post.ctx.fm.tags                  >> Array of tags

>> Conditional processing
/when @post.ctx.fm.published => show @post.content