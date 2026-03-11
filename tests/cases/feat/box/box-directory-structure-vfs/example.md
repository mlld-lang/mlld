/files <@box-dsv/> = [{ "src/main.js": "console.log('hi')" }, { "src/util.js": "module.exports = {}" }]

/var @out = box @box-dsv [
  let @count = run cmd { ls src | wc -l }
  => @count
]
/show @out