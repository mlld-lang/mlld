/var @result = run { echo '{"stance":"ok"}' }
/var @pipeParsed = @result | @json

/show `direct=@result.stance`
/show `pipe=@pipeParsed.stance`
/show `mx_data=@result.mx.data.stance`
