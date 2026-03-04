/files <@box-cme/> = [{ "greeting.txt": "hi there" }]

/exe @box-cme-reader(ws) = cmd:@ws { cat greeting.txt }
/exe @box-cme-upperer(ws) = cmd:@ws { cat greeting.txt | tr a-z A-Z }

/show @box-cme-reader(@box-cme)
/show @box-cme-upperer(@box-cme)