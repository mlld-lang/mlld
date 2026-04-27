const retained = [];

for (let i = 0; i < 4; i++) {
  retained.push(new Array(25_000).fill(`item-${i}`));
  const used = process.memoryUsage();
  console.log(JSON.stringify({
    type: 'metric',
    name: 'heapUsedMb',
    value: used.heapUsed / 1024 / 1024
  }));
  await new Promise(resolve => setTimeout(resolve, 15));
}

console.log(JSON.stringify({
  type: 'metric',
  name: 'retainedChunks',
  value: retained.length
}));
