import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { BAR_FIELD_OPTIONS, ATTRIBUTE_COLUMN_OPTIONS } from '../Calendar/WeekGrid'
import { DURATION_LEGEND, colorKeyFor } from '../../utils/colors'

const COLOR_MODE_OPTIONS = [
  { value: 'duration', label: 'Durata cursului (implicit)' },
  { value: 'responsible', label: 'Responsabil curs' },
  { value: 'category', label: 'Categorie curs (arie)' },
]

export default function SettingsPage() {
  const { profile, updatePreferences } = useAuth()

  const [selectedFields, setSelectedFields] = useState(profile?.week_bar_fields || ['time'])
  const [attrColumns, setAttrColumns] = useState(profile?.week_attribute_columns || ['interval', 'trainer', 'room', 'responsible'])
  const [colorMode, setColorMode] = useState(profile?.color_mode || 'duration')
  const [customColors, setCustomColors] = useState(profile?.custom_colors || {})
  const [distinctResponsible, setDistinctResponsible] = useState([])
  const [distinctCategories, setDistinctCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [draggingKey, setDraggingKey] = useState(null)
  const rowRefs = useRef({})

  function markDirty() {
    setSaved(false)
    setDirty(true)
  }

  useEffect(() => {
    supabase
      .from('courses')
      .select('responsible, course_area')
      .then(({ data }) => {
        const responsibleSet = new Set()
        const categorySet = new Set()
        for (const row of data || []) {
          if (row.responsible) responsibleSet.add(row.responsible)
          if (row.course_area) categorySet.add(row.course_area)
        }
        setDistinctResponsible([...responsibleSet].sort())
        setDistinctCategories([...categorySet].sort())
      })
  }, [])

  function toggleField(key) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    markDirty()
  }

  function toggleAttrColumn(key) {
    setAttrColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    markDirty()
  }

  function moveAttrColumn(key, direction) {
    setAttrColumns((prev) => {
      const idx = prev.indexOf(key)
      const newIdx = idx + direction
      if (idx === -1 || newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
    markDirty()
  }

  // Drag & drop cu Pointer Events - functioneaza identic cu mouse-ul (laptop)
  // si cu degetul (telefon/tableta), spre deosebire de HTML5 drag-and-drop
  // clasic, care nu merge bine pe ecrane touch.
  function handleDragStart(e, key) {
    e.preventDefault()
    setDraggingKey(key)
    let order = attrColumns

    function onPointerMove(moveEvent) {
      const y = moveEvent.clientY
      let closestIndex = 0
      let closestDist = Infinity
      order.forEach((k, idx) => {
        const el = rowRefs.current[k]
        if (!el) return
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const dist = Math.abs(center - y)
        if (dist < closestDist) {
          closestDist = dist
          closestIndex = idx
        }
      })
      const draggedIndex = order.indexOf(key)
      if (closestIndex !== draggedIndex) {
        const next = [...order]
        next.splice(draggedIndex, 1)
        next.splice(closestIndex, 0, key)
        order = next
        setAttrColumns(next)
      }
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      setDraggingKey(null)
      markDirty()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function updateColor(key, hex) {
    setCustomColors((prev) => ({ ...prev, [key]: hex }))
    markDirty()
  }

  function resetColor(key) {
    setCustomColors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    markDirty()
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await updatePreferences({
      week_bar_fields: selectedFields,
      week_attribute_columns: attrColumns,
      color_mode: colorMode,
      custom_colors: customColors,
    })
    setSaving(false)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setDirty(false)
    }
  }

  const colorPickerValues =
    colorMode === 'duration'
      ? DURATION_LEGEND.map((d) => ({ key: colorKeyFor('duration', d.key), label: d.label, defaultHex: d.border }))
      : colorMode === 'responsible'
      ? distinctResponsible.map((name) => ({ key: colorKeyFor('responsible', name), label: name, defaultHex: '#888888' }))
      : distinctCategories.map((cat) => ({ key: colorKeyFor('category', cat), label: cat, defaultHex: '#888888' }))

  return (
    <div className="settings-page">
      <h2>Setari</h2>
      <p className="admin-hint">
        Preferintele de mai jos sunt personale — se salveaza in contul tau si te urmaresc pe orice
        dispozitiv de pe care te loghezi.
      </p>

      <div className="admin-section">
        <h3>Campuri pe bara Gantt (vizualizare saptamanala)</h3>
        <p className="admin-hint">Denumirea cursului e mereu vizibila; alege ce altceva vrei sa vezi direct pe bara.</p>
        <div className="settings-checkbox-list">
          {BAR_FIELD_OPTIONS.map((field) => (
            <label key={field.key} className="settings-checkbox-row">
              <input type="checkbox" checked={selectedFields.includes(field.key)} onChange={() => toggleField(field.key)} />
              {field.label}
            </label>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h3>Coloane in tabelul saptamanal (dreapta zilelor)</h3>
        <p className="admin-hint">
          Cu cat alegi mai multe coloane, cu atat tabelul devine mai lat — peste un anumit numar
          poate aparea scroll orizontal pe ecrane mai mici. Ordinea de mai jos e chiar ordinea
          in care apar coloanele in tabel — trage de mânerul ⠿ ca sa le rearanjezi, sau
          foloseste sagetile.
        </p>

        {attrColumns.length === 0 ? (
          <p className="admin-hint">Nicio coloana aleasa momentan.</p>
        ) : (
          <table className="admin-table" style={{ marginBottom: 14 }}>
            <thead>
              <tr><th></th><th>Coloana afisata</th><th>Ordine</th><th></th></tr>
            </thead>
            <tbody>
              {attrColumns.map((key, index) => {
                const col = ATTRIBUTE_COLUMN_OPTIONS.find((c) => c.key === key)
                if (!col) return null
                return (
                  <tr
                    key={key}
                    ref={(el) => { rowRefs.current[key] = el }}
                    className={draggingKey === key ? 'settings-row-dragging' : ''}
                  >
                    <td>
                      <span
                        className="drag-handle"
                        onPointerDown={(e) => handleDragStart(e, key)}
                        title="Trage pentru reordonare"
                      >
                        ⠿
                      </span>
                    </td>
                    <td>{col.label}</td>
                    <td>
                      <button
                        className="reorder-btn"
                        disabled={index === 0}
                        onClick={() => moveAttrColumn(key, -1)}
                        title="Muta mai devreme"
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                          <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        className="reorder-btn"
                        disabled={index === attrColumns.length - 1}
                        onClick={() => moveAttrColumn(key, 1)}
                        title="Muta mai tarziu"
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </td>
                    <td>
                      <button className="link-btn danger-text" onClick={() => toggleAttrColumn(key)}>elimina</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {ATTRIBUTE_COLUMN_OPTIONS.some((col) => !attrColumns.includes(col.key)) && (
          <>
            <p className="admin-hint">Coloane disponibile, neafisate momentan:</p>
            <div className="settings-checkbox-list">
              {ATTRIBUTE_COLUMN_OPTIONS.filter((col) => !attrColumns.includes(col.key)).map((col) => (
                <label key={col.key} className="settings-checkbox-row">
                  <input type="checkbox" checked={false} onChange={() => toggleAttrColumn(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="admin-section">
        <h3>Culoarea barelor din calendar</h3>
        <p className="admin-hint">
          Alege dupa ce se coloreaza cursurile, apoi personalizeaza culoarea fiecarei valori mai jos
          (opțional — cele nepersonalizate primesc automat o culoare distincta).
        </p>

        <div className="settings-checkbox-list" style={{ marginBottom: 16 }}>
          {COLOR_MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="settings-checkbox-row">
              <input
                type="radio"
                name="colorMode"
                checked={colorMode === opt.value}
                onChange={() => { setColorMode(opt.value); markDirty() }}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {colorPickerValues.length === 0 ? (
          <p className="admin-hint">
            {colorMode === 'duration'
              ? ''
              : 'Nu exista inca niciun curs cu acest camp completat, deci nu e nimic de personalizat momentan.'}
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Valoare</th><th>Culoare</th><th></th></tr>
            </thead>
            <tbody>
              {colorPickerValues.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>
                    <input
                      type="color"
                      value={customColors[row.key] || row.defaultHex}
                      onChange={(e) => updateColor(row.key, e.target.value)}
                    />
                  </td>
                  <td>
                    {customColors[row.key] && (
                      <button className="link-btn" onClick={() => resetColor(row.key)}>reseteaza</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="modal-actions">
        <div className="spacer" />
        {saved && <span className="auth-info" style={{ marginRight: 10 }}>Salvat</span>}
        <button onClick={handleSave} disabled={saving}>{saving ? 'Se salveaza...' : 'Salveaza preferintele'}</button>
      </div>

      {dirty && (
        <div className="floating-save-bar">
          <span>Ai modificari nesalvate</span>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Se salveaza...' : 'Salveaza modificarile'}
          </button>
        </div>
      )}
    </div>
  )
}
