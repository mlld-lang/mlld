/var @quoted = run cmd { echo "user@@domain.com" }
/show @quoted
/var @unquoted = run cmd { echo user@@domain.com }
/show @unquoted
