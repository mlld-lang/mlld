/import { @pipeline } from "/shelf-import-export-merge-modes-state.mld"

/exe @emitContact(id, name, score) = js {
  return {
    id,
    email: id + "@example.com",
    name,
    score
  };
} => contact

/exe @emitDraft(subject) = js {
  return {
    recipient: "c_1@example.com",
    subject,
    body: "Hello"
  };
} => email_draft

/var @first = @emitContact("c_1", "Mark", 85)
/var @second = @emitContact("c_1", "Mark", 92)

@shelve(@pipeline.recipients, @first)
@shelve(@pipeline.recipients, @second)
@shelve(@pipeline.audit_log, @first)
@shelve(@pipeline.audit_log, @second)
@shelve(@pipeline.selected, @first)
@shelve(@pipeline.selected, @second)
@shelve(@pipeline.drafts, @emitDraft("Follow up"))

/show @pipeline.recipients[0].score
/show @pipeline.audit_log[0].score
/show @pipeline.audit_log[1].score
/show @pipeline.selected.score
/show @pipeline.drafts[0].subject
