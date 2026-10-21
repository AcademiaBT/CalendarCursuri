// Doua intervale orare (in aceeasi zi) se suprapun daca fiecare incepe
// strict inainte ca celalalt sa se termine - deci 12:00-13:00 si 13:00-14:00
// NU se suprapun (se ating doar). Orele din formular au formatul "HH:MM",
// iar cele din baza de date "HH:MM:SS" - comparate ca text, "13:00" < "13:00:00"
// ar parea suprapunere acolo unde nu e una. De-aia normalizam ambele la HH:MM.
// Daca oricare dintre ore lipseste, consideram ca ocupa toata ziua (suprapunere).
const hhmm = (t) => (t ? String(t).slice(0, 5) : '')

export function timesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return true
  return hhmm(startB) < hhmm(endA) && hhmm(startA) < hhmm(endB)
}
