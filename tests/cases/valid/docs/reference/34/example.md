/exe @formatDate(date) = run {date -d "@date" "+%Y-%m-%d"}
/exe @validate(data) = js { return data.valid === true }