Template files are used with exe, not var.

You attempted: ${ATTEMPTED_LINE}

Use an executable so you can pass parameters:
  exe @${VAR_NAME}(params) = template "${TEMPLATE_PATH}"

If you need raw file content, load it as a file:
  var @${VAR_NAME} = <${TEMPLATE_PATH}>
