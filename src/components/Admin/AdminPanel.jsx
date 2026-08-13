import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

function ListManager({ title, table, extraColumns = [] }) {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [extra, setExtra] = useState({})
  const [error, setError] = useState('')

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

  return (
    <div className="admin-section">
      <h3>{title}</h3>
      {error && <div className="auth-error">{error}</div>}

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
      </p>
      <ListManager title="Traineri" table="trainers" />
      <ListManager
        title="Sali"
        table="rooms"
        extraColumns={[{ key: 'capacity', label: 'Capacitate', type: 'number' }]}
      />
    </div>
  )
}
