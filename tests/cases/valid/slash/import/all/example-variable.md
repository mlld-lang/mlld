/path @configPath = "import-all-config.mld"
/import "@configPath" as myconfig
/show @myconfig.greeting
/show @myconfig.count