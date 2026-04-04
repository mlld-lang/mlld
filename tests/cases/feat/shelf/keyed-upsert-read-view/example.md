/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string],
  data: [score: number?],
  display: [name, { ref: "email" }]
}

/shelf @outreach = {
  recipients: contact[]
}

/exe @emitContact(score) = js {
  return {
    id: "c_1",
    email: "mark@example.com",
    name: "Mark",
    score
  };
} => contact

/var @first = @emitContact(85)
/var @second = @emitContact(92)

@shelve(@outreach.recipients, @first)
@shelve(@outreach.recipients, @second)

/show @outreach.recipients[0].score
/show @outreach.recipients[0].mx.taint.includes('src:shelf:@outreach.recipients')

/box {
  shelf: {
    read: [@outreach.recipients]
  }
} [
  let @recipients = @fyi.shelf.outreach.recipients
  show @recipients[0].name
  show @recipients[0].email.value
]
