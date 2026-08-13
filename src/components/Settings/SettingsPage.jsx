import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { BAR_FIELD_OPTIONS } from '../Calendar/WeekGrid'
import { DURATION_LEGEND, colorKeyFor } from '../../utils/colors'

const COLOR_MODE_OPTIONS = [
  { value: 'duration', label: 'Durata cursului (implicit)' },
  { value: 'responsible', label: 'Responsabil curs' },
  { value: 'category', label: 'Categorie curs (arie)' },
]

export default function SettingsPage() {
  const { profile, updatePreferences } = useAuth()

  const [selectedFields, setSelectedFields] = useState(profile?.week_bar_fields || ['time'])
  const [colorMode, setColorMode] = useState(profile?.color_mode || 'duration')
  const [customColors, setCustomColors] = useState(profile?.custom_colors || {})
  const [distinctResponsible, setDistinctResponsible] = useState([])
  const [distinctCategories, setDistinctCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

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
    setSaved(false)
  }

  function updateColor(key, hex) {
    setCustomColors((prev) => ({ ...prev, [key]: hex }))
    setSaved(false)
  }

  function resetColor(key) {
    setCustomColors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error } = await updatePreferences({
      week_bar_fields: selectedFields,
      color_mode: colorMode,
      custom_colors: customColors,
    })
    setSaving(false)
    if (error) setError(error.message)
    else setSaved(true)
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
                onChange={() => { setColorMode(opt.value); setSaved(false) }}
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
    </div>
  )
}
