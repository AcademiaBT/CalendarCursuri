import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import useNavbarOffset from '../../hooks/useNavbarOffset'

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

// Listeaza toti userii inregistrati (tabelul "profiles", creat automat de
// Supabase la fiecare cont nou) si lasa adminul sa editeze central, pentru
// fiecare: rolul, si mai ales corespondenta cu lista "Responsabili" - ce
// nume din acea lista apartine userului respectiv (folosita pentru alerta
// TBD personalizata: la logare, userul e atentionat daca EL, ca responsabil,
// are cursuri apropiate cu trainer/sala inca nedecise). Userii nu se pot
// crea de aici - raman creati manual din Supabase (fara inregistrare din
// aplicatie), asa cum e stabilit deja.
function UsersManager() {
  const { user: currentUser } = useAuth()
  const [items, setItems] = useState([])
  const [responsibleOptions, setResponsibleOptions] = useState([])
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*').order('email')
    if (error) setError(error.message)
    else setItems(data || [])
  }

  useEffect(() => {
    load()
    supabase
      .from('responsible_persons')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setResponsibleOptions(data || []))
  }, [])

  async function saveField(id, field, value) {
    setError('')
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  // userul poate fi legat de mai multi responsabili deodata (ex: cineva
  // care acopera si rolul altcuiva) - bifarea/debifarea unui nume actualizeaza
  // direct lista din baza de date
  function toggleResponsibleName(item, name) {
    const current = item.responsible_names || []
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    saveField(item.id, 'responsible_names', next)
  }

  function handleRoleChange(item, newRole) {
    if (item.id === currentUser?.id && newRole !== 'admin') {
      if (!confirm('Iti retragi singur rolul de admin. Nu vei mai putea reveni aici fara ajutorul altui admin. Esti sigur?')) return
    }
    saveField(item.id, 'role', newRole)
  }

  return (
    <div className="admin-section">
      <h3>Useri</h3>
      <p className="admin-hint">
        Userii se creeaza in continuare manual, din Supabase (fara inregistrare din
        aplicatie). Aici legi fiecare user de numele lui din lista "Responsabili" de mai
        jos - astfel, la logare, alerta TBD ii arata userului cursurile unde EL e
        responsabilul si mai are trainer sau sala nedecise.
      </p>
      {error && <div className="auth-error">{error}</div>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Responsabili corespunzatori</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.email}</td>
              <td>
                <select value={item.role} onChange={(e) => handleRoleChange(item, e.target.value)}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td>
                {responsibleOptions.length === 0 ? (
                  <span className="admin-hint">Niciun responsabil activ in lista.</span>
                ) : (
                  <div className="user-responsible-checks">
                    {responsibleOptions.map((r) => (
                      <label key={r.id} className="user-responsible-check">
                        <input
                          type="checkbox"
                          checked={(item.responsible_names || []).includes(r.name)}
                          onChange={() => toggleResponsibleName(item, r.name)}
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BackupSettingsPanel({ onDirtyChange }) {
  const [settings, setSettings] = useState(null)
  const [frequency, setFrequency] = useState('weekly')
  const [emails, setEmails] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const { height: navbarHeight } = useNavbarOffset()

  async function load() {
    const { data, error } = await supabase.from('backup_settings').select('*').eq('id', 1).single()
    if (error) setError(error.message)
    else {
      setSettings(data)
      setFrequency(data.frequency)
      setEmails(data.recipient_emails || '')
    }
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('backup_settings')
      .update({ frequency, recipient_emails: emails.trim(), updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setDirty(false)
      onDirtyChange?.(false)
      load()
    }
  }

  function handleDiscard() {
    if (settings) {
      setFrequency(settings.frequency)
      setEmails(settings.recipient_emails || '')
    }
    setError('')
    setSaved(false)
    setDirty(false)
    onDirtyChange?.(false)
  }

  function markDirty() {
    setSaved(false)
    setDirty(true)
    onDirtyChange?.(true)
  }

  return (
    <div className="admin-section">
      <h3>Backup automat (export xlsx pe email)</h3>
      <p className="admin-hint">
        Trimite periodic, automat, tot calendarul de cursuri, ca fisier Excel, la adresa
        (adresele) de mai jos. Necesita o configurare unica in GitHub (secretele Brevo) —
        vezi README-ul proiectului, sectiunea "Backup automat".
      </p>

      {error && <div className="auth-error">{error}</div>}

      <label className="settings-checkbox-row" style={{ display: 'block', marginBottom: 10 }}>
        Frecventa
        <select value={frequency} onChange={(e) => { setFrequency(e.target.value); markDirty() }} style={{ marginLeft: 10 }}>
          <option value="daily">Zilnic</option>
          <option value="weekly">Saptamanal</option>
          <option value="monthly">Lunar</option>
          <option value="disabled">Fara backup (dezactivat)</option>
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 10 }}>
        <div className="admin-hint" style={{ marginBottom: 4 }}>Adresa (sau adrese, separate prin virgula)</div>
        <input
          style={{ width: '100%', maxWidth: 420 }}
          placeholder="ex: costin.muresan@yahoo.com, altcineva@exemplu.com"
          value={emails}
          onChange={(e) => { setEmails(e.target.value); markDirty() }}
        />
      </label>

      {settings?.last_sent_at && (
        <p className="admin-hint">
          Ultimul backup trimis: {new Date(settings.last_sent_at).toLocaleString('ro-RO')}
        </p>
      )}

      <div className="modal-actions">
        <div className="spacer" />
        {saved && <span className="auth-info" style={{ marginRight: 10 }}>Salvat</span>}
        {dirty && (
          <button className="secondary-btn" onClick={handleDiscard} disabled={saving}>Renunta la modificari</button>
        )}
        <button onClick={handleSave} disabled={saving}>{saving ? 'Se salveaza...' : 'Salveaza'}</button>
      </div>

      {dirty && (
        <div className="floating-save-bar" style={{ top: navbarHeight }}>
          <span>Ai modificari nesalvate</span>
          <div className="floating-save-bar-actions">
            <button className="floating-discard-btn" onClick={handleDiscard} disabled={saving}>Renunta la modificari</button>
            <button onClick={handleSave} disabled={saving}>{saving ? 'Se salveaza...' : 'Salveaza'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPanel() {
  const [backupDirty, setBackupDirty] = useState(false)

  return (
    <div className={`admin-page ${backupDirty ? 'admin-page-with-floating-bar' : ''}`}>
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
      <UsersManager />
      <BackupSettingsPanel onDirtyChange={setBackupDirty} />
    </div>
  )
}
