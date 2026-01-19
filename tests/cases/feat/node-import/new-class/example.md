# Node new expression for class constructors

/import { URL } from node @url
/exe @site = new @URL("https://example.com/path?x=1")
/show @site.hostname
/show @site.pathname
