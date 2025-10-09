/exe @wrap() = js { return [[1,2], [3,4]]; }
/var @nested = @wrap() | @json
/show @nested[0]
