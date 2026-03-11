/files <@box-csr-a/> = [{ "data.txt": "OUTER" }]
/files <@box-csr-b/> = [{ "data.txt": "INNER" }]

/exe @box-csr-readA(ws) = cmd:@ws { cat data.txt }
/exe @box-csr-readB(ws) = cmd:@ws { cat data.txt }

/show @box-csr-readA(@box-csr-a)
/show @box-csr-readB(@box-csr-b)