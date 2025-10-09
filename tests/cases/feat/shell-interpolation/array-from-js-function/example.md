# Test: Complex Array from JavaScript Function

>> Tests that arrays returned from JS functions are handled correctly

/exe @make_data() = js {
  return [
    [{"type": "A"}, {"type": "B"}],
    [{"type": "C"}, {"type": "D"}]
  ];
}

/var @data = @make_data()
/run { echo @data }
