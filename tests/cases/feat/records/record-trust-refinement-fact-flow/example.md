/policy @p = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["tool:w"] }
}

/record @transaction = {
  facts: [recipient: string],
  data: [subject: string]
}

/exe untrusted @getTransaction() = {
  recipient: "acct-1",
  subject: "Rent"
} => transaction

/exe tool:w @update(recipient) = `ok:@recipient`

/var @txn = @getTransaction()
/show @txn.recipient.mx.labels.includes("untrusted")
/show @txn.subject.mx.labels.includes("untrusted")
/show @update(@txn.recipient)
