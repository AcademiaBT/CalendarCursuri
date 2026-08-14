import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

// Nume de coloana acceptate in Excel pentru randul de antet (daca exista) -
// orice alt text de pe prima coloana e tratat ca fiind chiar o valoare de
// importat, nu un antet.
const HEADER_ALIASES = ['nume', 'name', 'denumire', 'trainer', 'sala', 'responsabil', 'capacitate', 'capacity']

function ListManager({ title, table, extraColumns = [], importHint }) {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [extra, setExtra] = useState({})
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const fileInputRef = useRef(null)

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('name')
    if (error) setError(error.message)
    else setItems(data || [])
  }

  useEffect(() => { load() }, [])

  async function addItem(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return
    const { error } = await supabase.from(table).insert({ name: name.trim(), ...extra })
    if (error) setError(error.message)
    else {
      setName('')
      setExtra({})
      load()
    }
  }

  async function toggleActive(item) {
    await supabase.from(table).update({ active: !item.active }).eq('id', item.id)
    load()
  }

  async function removeItem(item) {
    if (!confirm(`Stergi "${item.name}"?`)) return
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) setError(error.message)
    else load()
  }

  // Import dintr-un fisier Excel: citeste prima coloana din prima foaie ca
  // nume, si (daca lista are o coloana "capacity") a doua coloana ca numar.
  // Randul de antet (ex: "Nume"/"Sala"/"Capacitate") e detectat si ignorat
  // automat. Numele duplicate (dupa cele deja existente) sunt sarite, nu
  // dau eroare.
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError('')
    setImportResult('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })

      const hasCapacity = extraColumns.some((c) => c.key === 'capacity')
      const seen = new Map() // name -> row de inserat

      for (const row of rows) {
        const rawName = row[0]
        if (rawName === undefined || rawName === null) continue
        const name = String(rawName).trim()
        if (!name) continue
        if (HEADER_ALIASES.includes(name.toLowerCase())) continue // sare randul de antet

        const record = { name }
        if (hasCapacity && row[1] !== undefined && row[1] !== '') {
          const capacity = Number(row[1])
          if (!Number.isNaN(capacity)) record.capacity = capacity
        }
        seen.set(name, record)
      }

      const toInsert = [...seen.values()]

      if (toInsert.length === 0) {
        setError('Nu am gasit niciun nume valid in fisier (prima coloana, prima foaie).')
      } else {
        const { data, error } = await supabase
          .from(table)
          .upsert(toInsert, { onConflict: 'name', ignoreDuplicates: true })
          .select()
        if (error) throw error
        setImportResult(`Import reusit: ${data?.length ?? 0} adaugate din ${toInsert.length} gasite in fisier (restul existau deja).`)
        load()
      }
    } catch (err) {
      setError('Eroare la citirea fisierului: ' + (err.message || 'format neasteptat. Foloseste un fisier .xlsx sau .csv.'))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="admin-section">
      <h3>{title}</h3>
      {error && <div className="auth-error">{error}</div>}
      {importResult && <div className="auth-info">{importResult}</div>}

      <form className="admin-add-form" onSubmit={addItem}>
        <input placeholder="Nume" value={name} onChange={(e) => setName(e.target.value)} required />
        {extraColumns.map((col) => (
          <input
            key={col.key}
            type={col.type || 'text'}
            placeholder={col.label}
            value={extra[col.key] || ''}
            onChange={(e) => setExtra((x) => ({ ...x, [col.key]: e.target.value }))}
          />
        ))}
        <button type="submit">Adauga</button>
      </form>

      <div className="admin-import-row">
        <label className="secondary-btn admin-import-label">
          {importing ? 'Se importa...' : 'Importa din Excel'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            disabled={importing}
            style={{ display: 'none' }}
          />
        </label>
        <span className="admin-hint admin-import-hint">
          {importHint || 'Fisier cu o coloana de nume (prima foaie, prima coloana). Randul de antet, daca exista, e ignorat automat.'}
        </span>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nume</th>
            {extraColumns.map((c) => <th key={c.key}>{c.label}</th>)}
            <th>Activ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.active ? '' : 'row-inactive'}>
              <td>{item.name}</td>
              {extraColumns.map((c) => <td key={c.key}>{item[c.key] ?? '-'}</td>)}
              <td>
                <input type="checkbox" checked={item.active} onChange={() => toggleActive(item)} />
              </td>
              <td>
                <button className="link-btn danger-text" onClick={() => removeItem(item)}>sterge</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminPanel() {
  return (
    <div className="admin-page">
      <h2>Administrare</h2>
      <p className="admin-hint">
        Aici gestionezi listele care alimenteaza dropdown-urile din formularul de curs.
        Debifarea "Activ" ascunde elementul din formulare fara sa stearga cursurile existente.
        Poti adauga elemente unul cate unul, sau importa in bloc dintr-un fisier Excel.
      </p>
      <ListManager title="Traineri" table="trainers" />
      <ListManager
        title="Sali"
        table="rooms"
        extraColumns={[{ key: 'capacity', label: 'Capacitate', type: 'number' }]}
        importHint="Fisier cu doua coloane: nume sala, capacitate (optional)."
      />
      <ListManager title="Responsabili" table="responsible_persons" />
    </div>
  )
}
