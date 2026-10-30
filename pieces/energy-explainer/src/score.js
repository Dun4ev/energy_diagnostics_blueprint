  // Original, restrained score: warm chords and small cues for the pointer.
  to = 'm';
  const chords = [
    ['D3', 'A3', 'Fs4'], ['G3', 'D4', 'B4'], ['A3', 'E4', 'Cs5'], ['D3', 'A3', 'D4']
  ];
  for (let i = 0; i < 7; i++) {
    const a = i * 16, b = Math.min(DURATION, a + 16);
    pad(a, b, chords[i % chords.length], 0.018, { type: 'triangle', cut: 900, att: 1.4, rel: 1.8, send: 0.3 });
  }
  for (let i = 0; i < STEPS.length; i++) {
    pluck(i * 8 + 0.6, nz(['D4', 'Fs4', 'A4', 'E4'][i % 4]), 0.035, 0, 0.45, 1700, 0.18);
  }
  to = 's';
  for (const i of [1, 2, 4, 8]) blip(i * 8 + 2.55, 620, 780, 0.08, 0.012, 0);
