import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { exportCoursesToPdf } from '../../utils/exportPdf'
import { exportCoursesToXlsx } from '../../utils/exportXlsx'
import { toISODate } from '../../utils/dateHelpers'
import {
  trainerLoadReport,
  roomOccupancyReport,
  responsibleLoadReport,
  categoryMixReport,
  courseTypeMixReport,
  totalParticipants,
  periodDays,
} from '../../utils/reportStats'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import DateInputRO from '../DateInputRO'

export default function ReportsPage() {
  const [trainers, setTrainers] = useState([])
  const [rooms, setRooms] = useState([])
  const [responsibles, setResponsibles] = useState([])
  const [categories, setCategories] = useState([])
  const [targetAudiences, setTargetAudiences] = useState([])

  const [filters, setFilters] = useState({
    startDate: toISODate(startOfMonth(new Date())),
    endDate: toISODate(endOfMonth(new Date())),
    trainer: '',
    room: '',
    courseType: '',
    responsible: '',
    category: '',
    targetAudience: '',
    search: '',
    onlyTbd: false,
  })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('list') // 'list' | 'stats'

  useEffect(() => {
    supabase.from('trainers').select('name').order('name').then(({ data }) => setTrainers(data || []))
    supabase.from('rooms').select('name').order('name').then(({ data }) => setRooms(data || []))
    supabase.from('responsible_persons').select('name').eq('active', true).order('name')
      .then(({ data }) => setResponsibles(data || []))
    // categorie/arie si public tinta sunt campuri libere pe curs (nu au o
    // lista gestionata in Administrare), deci luam valorile distincte deja
    // folosite, ca optiuni de filtrare
    supabase.from('courses').select('course_area, target_audience').then(({ data }) => {
      const rows = data || []
      setCategories([...new Set(rows.map((r) => r.course_area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')))
      setTargetAudiences([...new Set(rows.map((r) => r.target_audience).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')))
    })
  }, [])

  function updateFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  async function runSearch(e) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    let query = supabase
      .from('courses')
      .select('*')
      .lte('start_date', filters.endDate)
      .gte('end_date', filters.startDate)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (filters.trainer) query = query.eq('trainer', filters.trainer)
    if (filters.room) query = query.eq('room', filters.room)
    if (filters.courseType) query = query.eq('course_type', filters.courseType)
    if (filters.responsible) query = query.eq('responsible', filters.responsible)
    if (filters.category) query = query.eq('course_area', filters.category)
    if (filters.targetAudience) query = query.eq('target_audience', filters.targetAudience)
    if (filters.search.trim()) {
      // scapam caracterele speciale pentru ilike, ca sa nu strice sintaxa filtrului
      const term = filters.search.trim().replace(/[%,]/g, '')
      query = query.or(`name.ilike.%${term}%,notes.ilike.%${term}%`)
    }
    if (filters.onlyTbd) {
      // orice curs cu cel putin un atribut obligatoriu inca nedecis -
      // responsible poate fi si gol/null (nu doar literal "TBD"), vezi
      // acelasi rationament ca la alerta de la logare
      query = query.or('trainer.eq.TBD,room.eq.TBD,responsible.eq.TBD,responsible.is.null')
    }

    const { data, error } = await query
    setLoading(false)
    if (error) setError(error.message)
    else setResults(data || [])
  }

  function filtersLabel() {
    const parts = [`Perioada: ${filters.startDate} - ${filters.endDate}`]
    if (filters.trainer) parts.push(`Trainer: ${filters.trainer}`)
    if (filters.room) parts.push(`Sala: ${filters.room}`)
    if (filters.courseType) parts.push(`Tip: ${filters.courseType}`)
    if (filters.responsible) parts.push(`Responsabil: ${filters.responsible}`)
    if (filters.category) parts.push(`Categorie: ${filters.category}`)
    if (filters.targetAudience) parts.push(`Public tinta: ${filters.targetAudience}`)
    if (filters.search) parts.push(`Cauta: "${filters.search}"`)
    if (filters.onlyTbd) parts.push('Doar neclarificate (TBD)')
    return parts.join('  |  ')
  }

  // statisticile se calculeaza direct din rezultatele curente (acelasi
  // filtru ca lista), fara interogari suplimentare
  const stats = useMemo(() => {
    if (!results) return null
    return {
      trainerLoad: trainerLoadReport(results),
      roomOccupancy: roomOccupancyReport(results),
      responsibleLoad: responsibleLoadReport(results),
      categoryMix: categoryMixReport(results),
      courseTypeMix: courseTypeMixReport(results),
      totalParticipants: totalParticipants(results),
      periodDays: periodDays(filters.startDate, filters.endDate),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  return (
    <div className="reports-page">
      <h2>Rapoarte</h2>

      <form className="reports-filters" onSubmit={runSearch}>
        <label>
          De la data
          <DateInputRO value={filters.startDate} onChange={(v) => updateFilter('startDate', v)} />
        </label>
        <label>
          Pana la data
          <DateInputRO value={filters.endDate} onChange={(v) => updateFilter('endDate', v)} />
        </label>
        <label>
          Trainer
          <select value={filters.trainer} onChange={(e) => updateFilter('trainer', e.target.value)}>
            <option value="">Toti</option>
            {trainers.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        <label>
          Sala
          <select value={filters.room} onChange={(e) => updateFilter('room', e.target.value)}>
            <option value="">Toate</option>
            {rooms.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </label>
        <label>
          Tip curs
          <select value={filters.courseType} onChange={(e) => updateFilter('courseType', e.target.value)}>
            <option value="">Toate</option>
            <option value="live">live</option>
            <option value="online">online</option>
            <option value="blended">blended</option>
            <option value="e-learning">e-learning</option>
          </select>
        </label>
        <label>
          Responsabil
          <select value={filters.responsible} onChange={(e) => updateFilter('responsible', e.target.value)}>
            <option value="">Toti</option>
            {responsibles.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </label>
        <label>
          Categorie
          <select value={filters.category} onChange={(e) => updateFilter('category', e.target.value)}>
            <option value="">Toate</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Public tinta
          <select value={filters.targetAudience} onChange={(e) => updateFilter('targetAudience', e.target.value)}>
            <option value="">Toate</option>
            {targetAudiences.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Cauta (nume / observatii)
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            placeholder="ex: onboarding"
          />
        </label>
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={filters.onlyTbd}
            onChange={(e) => updateFilter('onlyTbd', e.target.checked)}
          />
          Doar neclarificate (TBD)
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Se cauta...' : 'Cauta'}</button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {results && (
        <div className="reports-results">
          <div className="reports-results-header">
            <span>{results.length} curs(uri) gasite</span>
            <div className="view-mode-toggle">
              <button className={view === 'list' ? 'view-mode-active' : ''} onClick={() => setView('list')}>
                Lista cursuri
              </button>
              <button className={view === 'stats' ? 'view-mode-active' : ''} onClick={() => setView('stats')}>
                Statistici
              </button>
            </div>
            <div className="reports-actions">
              <button
                disabled={results.length === 0}
                onClick={() => exportCoursesToPdf(results, { filtersLabel: filtersLabel() })}
              >
                Descarca PDF
              </button>
              <button
                disabled={results.length === 0}
                className="secondary-btn"
                onClick={() => exportCoursesToXlsx(results)}
              >
                Descarca Excel
              </button>
            </div>
          </div>

          {view === 'list' ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Curs</th><th>Tip</th><th>Start</th><th>Sfarsit</th><th>Interval</th>
                  <th>Trainer</th><th>Sala</th><th>Nr. part.</th><th>Responsabil</th>
                  <th>Categorie</th><th>Public tinta</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.course_type}</td>
                    <td>{c.start_date}</td>
                    <td>{c.end_date}</td>
                    <td>{c.start_time?.slice(0, 5)}-{c.end_time?.slice(0, 5)}</td>
                    <td>{c.trainer}</td>
                    <td>{c.room}</td>
                    <td>{c.participants_count}</td>
                    <td>{c.responsible}</td>
                    <td>{c.course_area || '—'}</td>
                    <td>{c.target_audience || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <StatsView stats={stats} />
          )}
        </div>
      )}
    </div>
  )
}

// Tabel simplu de agregare, reutilizat pentru fiecare raport (incarcare
// traineri/sali/responsabili, mix categorii/tip) - "showOccupancy" adauga o
// coloana procentuala fata de numarul de zile din intervalul selectat
// (relevant pentru traineri/sali - "cat de ocupati au fost", nu si pentru
// responsabili/categorii, unde procentul n-ar avea sens la fel de direct).
function StatsTable({ title, rows, periodDays, showOccupancy }) {
  return (
    <div className="admin-section">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="admin-hint">Niciun rezultat pentru filtrele curente.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nume</th>
              <th>Nr. cursuri</th>
              <th>Zile cumulate</th>
              {showOccupancy && <th>Ocupare (din interval)</th>}
              <th>Participanti</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.key}</td>
                <td>{r.count}</td>
                <td>{r.days}</td>
                {showOccupancy && (
                  <td>{periodDays > 0 ? Math.round((r.days / periodDays) * 100) : 0}%</td>
                )}
                <td>{r.participants || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StatsView({ stats }) {
  if (!stats) return null
  return (
    <div className="reports-stats">
      <div className="admin-section">
        <h3>Total participanti instruiti</h3>
        <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
          {stats.totalParticipants}
        </p>
        <p className="admin-hint">Suma "Nr. participanti" pentru toate cursurile din rezultatul curent.</p>
      </div>

      <StatsTable title="Incarcare traineri" rows={stats.trainerLoad} periodDays={stats.periodDays} showOccupancy />
      <StatsTable title="Ocupare sali" rows={stats.roomOccupancy} periodDays={stats.periodDays} showOccupancy />
      <StatsTable title="Volum per responsabil" rows={stats.responsibleLoad} periodDays={stats.periodDays} />
      <StatsTable title="Mix pe categorii (arie curs)" rows={stats.categoryMix} periodDays={stats.periodDays} />
      <StatsTable title="Mix pe tip curs" rows={stats.courseTypeMix} periodDays={stats.periodDays} />
    </div>
  )
}
