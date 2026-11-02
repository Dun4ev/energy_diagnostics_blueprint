/** Prepare display segments without filling absent observations. */
export function ribbonSeries(eventTimes: string[], values: (number | null)[]) {
  const times = eventTimes.map(time => Date.parse(time));
  const intervals = times.slice(1).map((time, i) => time - times[i]).filter(value => value > 0).sort((a, b) => a - b);
  // A cadence is only inferred when at least two intervals are available. It is
  // a display heuristic, not a freshness or quality assessment.
  const gapLimit = intervals.length >= 2 ? intervals[Math.floor((intervals.length - 1) / 2)] * 1.5 : 0;
  const connected = (a: number, b: number) => gapLimit > 0 && times[b] > times[a] && times[b] - times[a] <= gapLimit;
  const data: (string | number | null)[][] = [];
  const isolated: (string | number)[][] = [];
  eventTimes.forEach((time, n) => {
    if (n && !connected(n - 1, n)) data.push([new Date(times[n - 1] + (times[n] - times[n - 1]) / 2).toISOString(), null]);
    data.push([time, values[n]]);
    const previous = n > 0 && values[n - 1] !== null && connected(n - 1, n);
    const next = n + 1 < eventTimes.length && values[n + 1] !== null && connected(n, n + 1);
    if (values[n] !== null && !previous && !next) isolated.push([time, values[n] as number]);
  });
  return { data, isolated };
}
