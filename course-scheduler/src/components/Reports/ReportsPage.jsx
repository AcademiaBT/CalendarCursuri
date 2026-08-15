import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { exportCoursesToPdf } from '../../utils/exportPdf'
import { exportCoursesToXlsx } from '../../utils/exportXlsx'
import { toISODate } from '../../utils/dateHelpers'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import DateInputRO from '../DateInputRO'

export default function ReportsPage() {
  const [trainers, setTrainers] = useState([])
  const [rooms, setRooms] = useState([])
  const [filters, setFilters] = useState({
    startDate: toISODate(startOfMonth(new Date())),
    endDate: toISODate(endOfMonth(new Date())),
    trainer: '',
    room: '',
    courseType: '',
  })
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('trainers').select('name').order('name').then(({ data }) => setTrainers(data || []))
    supabase.from('rooms').select('name').order('name').then(({ data }) => setRooms(data || []))
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
    return parts.join('  |  ')
  }

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
        <button type="submit" disabled={loading}>{loading ? 'Se cauta...' : 'Cauta'}</button>
      </form>

      {error && <div className="auth-error">{error}</div>}

      {results && (
        <div className="reports-results">
          <div className="reports-results-header">
            <span>{results.length} curs(uri) gasite</span>
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

          <table className="admin-table">
            <thead>
              <tr>
                <th>Curs</th><th>Tip</th><th>Start</th><th>Sfarsit</th><th>Interval</th>
                <th>Trainer</th><th>Sala</th><th>Nr. part.</th><th>Responsabil</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
