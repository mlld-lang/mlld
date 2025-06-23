/text @name = "bob smith"
/exec @format(name) = javascript {
  >> Format the name with title case
  const words = name.split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return titled.join(' ');
}
/run @format("bob smith")
