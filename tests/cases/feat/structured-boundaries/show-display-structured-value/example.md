/record @contact = {
  facts: [email: string],
  data: [name: string]
}
/exe @emit() = js {
  return {
    email: "ada@example.com",
    name: "Ada"
  };
} => contact
/show @emit()
