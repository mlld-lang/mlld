# Field Access on LoadContentResultArray Error

This error occurs when trying to access item properties directly on an array of loaded files.

## Example that triggers this error

```mlld
/var @files = <*.md>
/show @files.filename  >> Error: each file has a filename, not the array
```

## Correct approach

```mlld
/var @files = <*.md>

>> Option 1: Iterate over files
/for @file in @files => /show @file.filename

>> Option 2: Access array-level properties
/show @files.content  >> Concatenated content of all files
/show @files.length   >> Number of files

>> Option 3: Access specific file
/show @files[0].filename  >> First file's name
```