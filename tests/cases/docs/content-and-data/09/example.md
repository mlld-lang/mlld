/var @post = <blog/post.md>

/show @post.fm.title                     >> Post title
/show @post.fm.author                    >> Author name
/show @post.fm.tags                      >> Array of tags

>> Conditional processing
/when @post.fm.published => show @post.content