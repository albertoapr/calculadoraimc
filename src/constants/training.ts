/** Available training time slots, in minutes after midnight. */
export const trainingTimeRanges = [
  { start: 360, end: 540, label: '06h às 09h' },
  { start: 540, end: 720, label: '09h às 12h' },
  { start: 720, end: 900, label: '12h às 15h' },
  { start: 900, end: 1080, label: '15h às 18h' },
  { start: 1080, end: 1260, label: '18h às 21h' },
  { start: 1260, end: 1380, label: '21h às 23h' },
] as const
