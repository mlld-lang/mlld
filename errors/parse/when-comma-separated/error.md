Invalid when block syntax: conditions cannot be comma-separated

Found: ${LINE}

Each condition must be on its own line. Instead of:
  ${FIRST_CONDITION} => ${FIRST_ACTION}, ${SECOND_CONDITION} => ${SECOND_ACTION}

Use:
  ${FIRST_CONDITION} => ${FIRST_ACTION}
  ${SECOND_CONDITION} => ${SECOND_ACTION}

When blocks evaluate conditions line by line, not as comma-separated lists.