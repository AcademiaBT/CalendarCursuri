import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { toISODate } from '../../utils/dateHelpers'
import { roomDisplayName } from '../../utils/roomDisplay'
import { normalizeForCompare } from '../../utils/fuzzyMatch'
import { timesOverlap } from '../../utils/timeOverlap'
import DateInputRO from '../DateInputRO'

const isoToDMY = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const hasText = (v) => Boolean(v && String(v).trim())

function courseLine(c) {
  const dates = c.start_date === c.end_date
    ? isoToDMY(c.start_date)
    : `${isoToDMY(c.start_date)} → ${isoToDMY(c.end_date)}`
  const hours = c.start_time ? `, ${c.start_time.slice(0, 5)}-${c.end_time?.slice(0, 5) || ''}` : ''
  return `${c.name} — ${dates}${hours}`
}

// Lista de resurse (traineri sau sali), impartita in libere / ocupate.
// Cele ocupate sunt restranse, cu cursul care le ocupa, ca sa fie clar DE CE.
function ResourceGroup({ entries, freeLabel, busyLabel }) {
  const free = entries.filter((e) => e.busy.length === 0)
  const busy = entries.filter((e) => e.busy.length > 0)
  return (
    <div className="availability-group">
      <div className="availability-heading availability-heading-free">{freeLabel} ({free.length})</div>
      {free.length === 0 ? (
        <p className="admin-hint">Niciunul liber in perioada aleasa.</p>
      ) : (
        <ul className="availability-list availability-list-free">
          {free.map((e) => (
            <li key={e.key}>
              <strong>{e.label}</strong>
              {e.meta && <span className="availability-meta"> · {e.meta}</span>}
            </li>
          ))}
        </ul>
      )}
      {busy.length > 0 && (
        <details className="availability-busy">
          <summary>{busyLabel} ({busy.length})</summary>
          <ul className="availability-list">
            {busy.map((e) => (
              <li key={e.key}>
                <strong>{e.label}</strong>
                {e.meta && <span className="availability-meta"> · {e.meta}</span>}
                <ul className="availability-busy-courses">
                  {e.busy.map((c) => <li key={c.id}>{courseLine(c)}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export default function AvailabilityPage() {
  const today = toISODate(new Date())
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [cityFilter, setCityFilter] = useState('ALL') // 'ALL' | 'NONE' | nume oras
  const [minCapacity, setMinCapacity] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL') // 'ALL' | 'NONE' | nume companie

  const [trainers, setTrainers] = useState([])
  const [rooms, setRooms] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('trainers').select('*').eq('active', true).order('name').then(({ data }) => setTrainers(data || []))
    supabase.from('rooms').select('*').eq('active', true).order('name').then(({ data }) => setRooms(data || []))
  }, [])

  // validarea perioadei - aceleasi reguli ca la salvarea unui curs
  let periodError = ''
  if (!startDate || !endDate) periodError = 'Completeaza data de start si data de sfarsit.'
  else if (endDate < startDate) periodError = 'Data de sfarsit nu poate fi inainte de data de start.'
  else if (startDate === endDate && startTime && endTime && endTime < startTime) {
    periodError = 'Ora de sfarsit nu poate fi inainte de ora de start, in aceeasi zi.'
  }

  // cursurile care ating perioada aleasa (dupa date) - suprapunerea pe ore
  // se verifica mai jos, in browser, la fel ca la formularul de curs
  useEffect(() => {
    if (periodError) {
      setCourses([])
      return undefined
    }
    let ignore = false
    setLoading(true)
    setError('')
    supabase
      .from('courses')
      .select('id, name, start_date, end_date, start_time, end_time, trainers, rooms')
      .eq('cancelled', false)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .then(({ data, error: err }) => {
        if (ignore) return
        if (err) setError(err.message)
        else setCourses(data || [])
        setLoading(false)
      })
    return () => { ignore = true }
  }, [startDate, endDate, periodError])

  const busyCourses = useMemo(
    () => courses.filter((c) => timesOverlap(startTime, endTime, c.start_time, c.end_time)),
    [courses, startTime, endTime]
  )

  // optiunile filtrelor de oras / companie - doar valorile care chiar exista
  const cityOptions = useMemo(() => {
    const seen = new Map()
    rooms.forEach((r) => { if (hasText(r.city)) seen.set(normalizeForCompare(r.city), r.city.trim()) })
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ro'))
  }, [rooms])
  const companyOptions = useMemo(() => {
    const seen = new Map()
    trainers.forEach((t) => { if (hasText(t.company)) seen.set(normalizeForCompare(t.company), t.company.trim()) })
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ro'))
  }, [trainers])

  const trainerEntries = useMemo(() => {
    return trainers
      .filter((t) => t.name !== 'TBD')
      .filter((t) => {
        if (companyFilter === 'ALL') return true
        if (companyFilter === 'NONE') return !hasText(t.company)
        return normalizeForCompare(t.company || '') === normalizeForCompare(companyFilter)
      })
      .map((t) => ({
        key: t.id,
        label: t.name,
        meta: hasText(t.company) ? t.company.trim() : '',
        busy: busyCourses.filter((c) => (c.trainers || []).includes(t.name)),
      }))
  }, [trainers, companyFilter, busyCourses])

  const capacityNeeded = Number(minCapacity) > 0 ? Number(minCapacity) : 0

  // "Online" si "TBD" nu sunt sali fizice - nu intra niciodata in conflict, deci
  // nu au sens in lista de disponibilitate
  const roomEntries = useMemo(() => {
    return rooms
      .filter((r) => {
        const display = roomDisplayName(r)
        return display !== 'TBD' && display !== 'Online'
      })
      // capacitate necompletata = nu putem exclude sala, o aratam cu mentiune
      .filter((r) => !capacityNeeded || r.capacity == null || r.capacity >= capacityNeeded)
      .map((r) => {
        const display = roomDisplayName(r)
        const metaParts = []
        if (r.capacity != null) metaParts.push(`${r.capacity} locuri`)
        else if (capacityNeeded) metaParts.push('capacitate necompletata')
        return {
          key: r.id,
          label: display,
          meta: metaParts.join(', '),
          hasCity: hasText(r.city),
          city: r.city,
          busy: busyCourses.filter((c) => (c.rooms || []).includes(display)),
        }
      })
  }, [rooms, capacityNeeded, busyCourses])

  // Oras ales -> salile din acel oras, plus (separat, restrans) cele fara oras
  // completat, ca sa nu dispara nicio sala doar pentru ca nu are oras.
  let mainRooms = roomEntries
  let noCityRooms = []
  if (cityFilter === 'NONE') {
    mainRooms = roomEntries.filter((e) => !e.hasCity)
  } else if (cityFilter !== 'ALL') {
    mainRooms = roomEntries.filter((e) => e.hasCity && normalizeForCompare(e.city) === normalizeForCompare(cityFilter))
    noCityRooms = roomEntries.filter((e) => !e.hasCity)
  }

  return (
    <div className="availability-page">
      <h2>Disponibilitate</h2>
      <p className="admin-hint">
        Alege perioada, iar mai jos vezi ce traineri si ce sali sunt libere in acel interval.
        Regula e aceeasi ca la verificarea de conflict din formularul de curs: doua intervale
        orare care doar se ating (unul se termina la 13:00, altul incepe la 13:00) nu se
        suprapun, iar cursurile anulate nu ocupa nimic. Sala "Online" nu apare, fiindca nu are
        limita de rezervari.
      </p>

      <div className="availability-form">
        <div className="availability-field">
          <span>De la</span>
          <div className="availability-datetime">
            <DateInputRO
              value={startDate}
              onChange={(iso) => {
                setStartDate(iso)
                if (iso && (!endDate || endDate < iso)) setEndDate(iso)
              }}
            />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>
        <div className="availability-field">
          <span>Pana la</span>
          <div className="availability-datetime">
            <DateInputRO value={endDate} onChange={setEndDate} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <label className="availability-field">
          <span>Oras (sali)</span>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="ALL">Toate</option>
            {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="NONE">Fara oras</option>
          </select>
        </label>
        <label className="availability-field">
          <span>Capacitate minima (sali)</span>
          <input
            type="number"
            min="0"
            placeholder="optional"
            value={minCapacity}
            onChange={(e) => setMinCapacity(e.target.value)}
          />
        </label>
        <label className="availability-field">
          <span>Companie (traineri)</span>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="ALL">Toate</option>
            {companyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="NONE">Fara companie</option>
          </select>
        </label>
      </div>

      {periodError && <div className="form-warning">{periodError}</div>}
      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="admin-hint">Se verifica disponibilitatea...</p>}

      {!periodError && (
        <div className="availability-panels">
          <section className="availability-panel">
            <h3>Traineri</h3>
            {trainerEntries.length === 0 ? (
              <p className="admin-hint">Niciun trainer in lista (sau niciunul care sa respecte filtrul de companie).</p>
            ) : (
              <ResourceGroup entries={trainerEntries} freeLabel="Liberi" busyLabel="Ocupati" />
            )}
          </section>

          <section className="availability-panel">
            <h3>Sali</h3>
            {mainRooms.length === 0 ? (
              <p className="admin-hint">Nicio sala care sa respecte filtrele alese.</p>
            ) : (
              <ResourceGroup entries={mainRooms} freeLabel="Libere" busyLabel="Ocupate" />
            )}
            {noCityRooms.length > 0 && (
              <details className="availability-nocity">
                <summary>Sali fara oras completat ({noCityRooms.length})</summary>
                <ResourceGroup entries={noCityRooms} freeLabel="Libere" busyLabel="Ocupate" />
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
