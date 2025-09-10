>> Parallel group preserves declaration order despite varied completion times

/exe @A(input) = js { await new Promise(r=>setTimeout(r, 30)); return 'A'; }
/exe @B(input) = js { await new Promise(r=>setTimeout(r, 10)); return 'B'; }
/exe @C(input) = js { await new Promise(r=>setTimeout(r, 20)); return 'C'; }
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "seed"

/var @out = @seed() | @A || @B || @C | @combine
/show @out

