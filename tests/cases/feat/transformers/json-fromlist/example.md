# @json.fromlist transformer test

Convert a plain text list to JSON array:

/var @list = `
apple
banana
cherry
`

/var @fruits = @list | @json.fromlist

/show @fruits
