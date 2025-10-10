>> These produce identical results:
/var @shorthand = || @a() || @b() | @combine
/var @longhand = "" with { pipeline: [[@a, @b], @combine] }