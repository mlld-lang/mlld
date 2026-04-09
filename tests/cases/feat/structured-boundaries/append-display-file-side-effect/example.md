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
/append @emit() to "structured-boundaries-append.log"
/show <@base/structured-boundaries-append.log>
