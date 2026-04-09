/record @contact = {
  key: id,
  facts: [id: string],
  data: [name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emit() = js {
  return {
    id: "c_1",
    name: "Ada"
  };
} => contact
/var @binding = {
  slot: @pipeline.selected
}
@shelf.write(@binding.slot, @emit())
/show @shelf.read(@binding.slot).id
