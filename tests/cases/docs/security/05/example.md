/var secret @token = "sk-123"
/var @header = `Bearer @token`
/show @header.ctx.taint                    # ["secret"]