import { courseDurationDays } from './colors'

// Explicatia fiecarui raport - aceleasi texte apar si in interfata (sub
// titlul fiecarui card), si in exporturile PDF/Excel, ca oricine deschide
// raportul (chiar daca nu a vazut aplicatia) sa inteleaga ce reprezinta
// fara sa intrebe pe altcineva.
export const REPORT_EXPLANATIONS = {
  trainerLoad: 'Numarul de cursuri si zilele cumulate sustinute de fiecare trainer, in perioada selectata, cu procentul de ocupare din totalul zilelor intervalului.',
  roomOccupancy: 'Numarul de cursuri si zilele cumulate in care fiecare sala a fost folosita, in perioada selectata, cu procentul de ocupare din totalul zilelor intervalului.',
  responsibleLoad: 'Numarul de cursuri si zilele cumulate gestionate de fiecare responsabil, in perioada selectata.',
  categoryMix: 'Distributia cursurilor pe categorii/arii (ex: Soft skills, Tehnic, Conformitate), in perioada selectata.',
  courseTypeMix: 'Distributia cursurilor pe tip (live, online, blended, e-learning), in perioada selectata.',
}

// Grupeaza rezultatele dupa un camp (trainer/sala/responsabil/categorie/tip),
// insumand nr. de cursuri, zile cumulate si participanti pentru fiecare
// valoare distincta. Valorile lipsa sau "TBD" (pentru campurile cu acest
// sentinel) sunt grupate sub eticheta indicata, ca sa nu dispara din raport.
function groupBy(results, field, { missingLabel, isTbdSentinel = true } = {}) {
  const map = new Map()
  for (const c of results) {
    let key = c[field]
    if (!key || (isTbdSentinel && key === 'TBD')) key = missingLabel
    if (!map.has(key)) map.set(key, { key, count: 0, days: 0, participants: 0 })
    const entry = map.get(key)
    entry.count += 1
    entry.days += courseDurationDays(c.start_date, c.end_date)
    entry.participants += Number(c.participants_count) || 0
  }
  return [...map.values()].sort((a, b) => b.days - a.days)
}

export const trainerLoadReport = (results) =>
  groupBy(results, 'trainer', { missingLabel: 'TBD' })

export const roomOccupancyReport = (results) =>
  groupBy(results, 'room', { missingLabel: 'TBD' })

export const responsibleLoadReport = (results) =>
  groupBy(results, 'responsible', { missingLabel: 'TBD' })

export const categoryMixReport = (results) =>
  groupBy(results, 'course_area', { missingLabel: 'Fără categorie', isTbdSentinel: false })

export const courseTypeMixReport = (results) =>
  groupBy(results, 'course_type', { missingLabel: 'TBD' })

export const totalParticipants = (results) =>
  results.reduce((sum, c) => sum + (Number(c.participants_count) || 0), 0)

// numarul de zile din intervalul selectat (inclusiv capetele) - folosit ca
// numitor pentru procentul de ocupare al traineri/sali
export function periodDays(startDate, endDate) {
  return courseDurationDays(startDate, endDate)
}
