/var @markdown = <*.md>                  >> All .md in current dir
/var @tests = <**/*.test.js>             >> All test files recursively
/var @docs = <docs/**/*.md>              >> All markdown in docs tree
/var @source = <src/**/*.ts>             >> All TypeScript in src

>> Access individual files
/show @docs[0].content                    >> First file's content
/show @docs[0].filename                   >> First file's name