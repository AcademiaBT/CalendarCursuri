// Pot exista doua sali cu acelasi nume ("Sala 1"), in orase diferite - ca sa
// ramana distincte peste tot (verificare conflict, afisare, export), numele
// "real" folosit si stocat pe cursuri e intotdeauna formatul combinat de mai
// jos, nu doar numele simplu. Daca sala n-are oras completat, ramane doar
// numele (compatibil cu salile mai vechi, sau cu "TBD"/"Online").
export function roomDisplayName(room) {
  if (!room) return ''
  return room.city ? `${room.name} (${room.city})` : room.name
}

// inversul - dintr-un text "Sala 1 (Cluj)" scris de un user (sau dintr-o
// celula de Excel), extrage numele si orasul separat, ca sa poata fi
// salvate ca doua coloane distincte la crearea unei sali noi. Daca nu are
// paranteze, tot textul devine numele, fara oras.
export function parseRoomDisplay(rawValue) {
  const text = (rawValue || '').trim()
  const match = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (match) return { name: match[1].trim(), city: match[2].trim() }
  return { name: text, city: null }
}
