/var @run = { id: "original" }
/loop(2) [
  let @run = { ...@run, modified: true }
]
