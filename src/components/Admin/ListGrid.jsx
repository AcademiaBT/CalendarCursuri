import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { normalizeForCompare } from '../../utils/fuzzyMatch'

// Editare "stil Excel" pentru listele din Administrare (Traineri, Sali,
// Responsabili): toate randurile sunt campuri editabile, te deplasezi cu
// tastatura, iar modificarile se salveaza IN LOT, nu pe loc - la sali, o
// redenumire se propaga automat in cursuri, deci nu vrem sa se intample
// dintr-o tasta apasata din greseala.
//
// Taste: Tab / Shift+Tab = celula urmatoare / anterioara; Enter / Shift+Enter
// = jos / sus; sageti sus-jos = alt rand; sageti stanga-dreapta = alta celula
// (cand cursorul e la marginea textului); Space = bifeaza "Activ"; Esc =
// anuleaza modificarea din celula; Ctrl+Enter = rand nou; Ctrl+S = salveaza.

const norm = (v) => (v === null || v === undefined ? '' : String(v).trim())

function friendlyError(err) {
  if (err?.code === '23505') return 'exista deja un rand cu acest nume (si oras)'
  if (err?.code === '23514' || err?.code === '22P02') return 'valoare invalida'
  return err?.message || 'eroare necunoscuta'
}

export default function ListGrid({ table, extraColumns, items, onSaved, onClose }) {
  const hasCity = extraColumns.some((c) => c.key === 'city')
  const totalCols = extraColumns.length + 2 // nume + coloane extra + activ

  const makeDraft = (item) => ({
    name: norm(item.name),
    ...Object.fromEntries(extraColumns.map((c) => [c.key, norm(item[c.key])])),
    active: item.active !== false,
  })

  // "original" = ce e salvat in baza; "draft" = ce vezi si editezi acum
  const [rows, setRows] = useState(() =>
    items.map((item) => {
      const draft = makeDraft(item)
      return { key: item.id, id: item.id, original: draft, draft: { ...draft } }
    })
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [serverErrors, setServerErrors] = useState({})
  const cellRefs = useRef({})
  const pendingFocus = useRef(null)
  const newCounter = useRef(0)

  // pentru fiecare rand: ce s-a schimbat, ce erori are
  const analysis = useMemo(() => {
    const info = {}
    const groups = new Map()
    const keyOf = (d) => normalizeForCompare(d.name) + (hasCity ? '|' + normalizeForCompare(d.city) : '')

    for (const r of rows) {
      const d = r.draft
      const isNew = !r.id
      const blank = isNew && !norm(d.name) && extraColumns.every((c) => !norm(d[c.key]))
      let changed = []
      if (!blank) {
        if (isNew) {
          changed = ['name', ...extraColumns.map((c) => c.key).filter((k) => norm(d[k]) !== '')]
        } else {
          if (norm(d.name) !== norm(r.original.name)) changed.push('name')
          extraColumns.forEach((c) => {
            if (norm(d[c.key]) !== norm(r.original[c.key])) changed.push(c.key)
          })
          if (d.active !== r.original.active) changed.push('active')
        }
      }

      const errors = {}
      if (changed.length > 0) {
        if (!norm(d.name)) errors.name = 'Numele lipseste'
        extraColumns.forEach((c) => {
          const v = norm(d[c.key])
          if (c.type === 'number' && v !== '' && !/^\d+$/.test(v)) errors[c.key] = 'Numar intreg, 0 sau mai mare'
        })
      }
      info[r.key] = { blank, dirty: changed.length > 0, changed, errors }

      if (!blank && norm(d.name)) {
        const k = keyOf(d)
        groups.set(k, [...(groups.get(k) || []), r.key])
      }
    }

    // duplicate: marcam doar randurile modificate - un duplicat deja existent in
    // baza, pe care nu l-ai atins, nu trebuie sa blocheze salvarea altor randuri
    for (const keys of groups.values()) {
      if (keys.length > 1 && keys.some((k) => info[k].dirty)) {
        keys.forEach((k) => {
          if (info[k].dirty && !info[k].errors.name) {
            info[k].errors.name = hasCity ? 'Duplicat (acelasi nume si oras)' : 'Duplicat (acelasi nume)'
          }
        })
      }
    }
    return info
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirtyRows = rows.filter((r) => analysis[r.key]?.dirty)
  const errorCount = dirtyRows.filter((r) => Object.keys(analysis[r.key].errors).length > 0).length

  const q = normalizeForCompare(search)
  const visibleRows = rows.filter((r) => {
    if (!q || !r.id) return true // randurile noi raman mereu vizibile
    return [r.draft.name, ...extraColumns.map((c) => r.draft[c.key])].some((v) =>
      normalizeForCompare(String(v ?? '')).includes(q)
    )
  })

  const fieldAt = (col) => (col === 0 ? 'name' : col === totalCols - 1 ? 'active' : extraColumns[col - 1].key)

  function setCellRef(rowKey, col, el) {
    const k = `${rowKey}:${col}`
    if (el) cellRefs.current[k] = el
    else delete cellRefs.current[k]
  }

  function focusCell(rowIdx, colIdx) {
    const r = Math.max(0, Math.min(visibleRows.length - 1, rowIdx))
    const c = Math.max(0, Math.min(totalCols - 1, colIdx))
    const target = visibleRows[r]
    if (target) cellRefs.current[`${target.key}:${c}`]?.focus()
  }

  function updateDraft(rowKey, field, value) {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, draft: { ...r.draft, [field]: value } } : r)))
    setServerErrors((prev) => {
      if (!prev[rowKey]) return prev
      const next = { ...prev }
      delete next[rowKey]
      return next
    })
  }

  function revertCell(row, field) {
    const value = row.original ? row.original[field] : field === 'active' ? true : ''
    updateDraft(row.key, field, value)
  }

  function addRow() {
    newCounter.current += 1
    const key = `new-${newCounter.current}`
    const draft = { name: '', ...Object.fromEntries(extraColumns.map((c) => [c.key, ''])), active: true }
    setRows((prev) => [{ key, id: null, original: null, draft }, ...prev])
    pendingFocus.current = { key, col: 0 }
  }

  // dupa ce randul nou apare in DOM, punem cursorul pe el
  useEffect(() => {
    if (pendingFocus.current) {
      const { key, col } = pendingFocus.current
      pendingFocus.current = null
      cellRefs.current[`${key}:${col}`]?.focus()
    }
  }, [rows])

  function onCellKeyDown(e, row, rowIdx, colIdx) {
    if (e.nativeEvent.isComposing) return
    if (e.ctrlKey || e.metaKey) return // Ctrl+S / Ctrl+Enter sunt tratate la nivel de container
    const isCheckbox = colIdx === totalCols - 1

    if (e.key === 'Enter') {
      e.preventDefault()
      focusCell(rowIdx + (e.shiftKey ? -1 : 1), colIdx)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusCell(rowIdx + 1, colIdx)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusCell(rowIdx - 1, colIdx)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      revertCell(row, fieldAt(colIdx))
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      if (!isCheckbox) {
        const el = e.target
        const atStart = el.selectionStart === 0 && el.selectionEnd === 0
        const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length
        if (e.key === 'ArrowLeft' && !atStart) return
        if (e.key === 'ArrowRight' && !atEnd) return
      }
      e.preventDefault()
      focusCell(rowIdx, colIdx + (e.key === 'ArrowLeft' ? -1 : 1))
    }
  }

  async function saveAll() {
    if (saving) return
    setMessage('')
    if (dirtyRows.length === 0) {
      setMessage('Nu sunt modificari de salvat.')
      return
    }
    if (errorCount > 0) {
      setMessage('Corecteaza mai intai celulele marcate cu rosu.')
      return
    }

    const newCount = dirtyRows.filter((r) => !r.id).length
    let confirmText = `Salvezi ${dirtyRows.length} modificari (${dirtyRows.length - newCount} randuri actualizate, ${newCount} randuri noi)?`
    const roomRenamed = table === 'rooms' && dirtyRows.some((r) => r.id && (analysis[r.key].changed.includes('name') || analysis[r.key].changed.includes('city')))
    if (roomRenamed) confirmText += '\n\nSchimbarea numelui sau a orasului unei sali se propaga automat si in cursurile existente.'
    if (!confirm(confirmText)) return

    setSaving(true)
    setServerErrors({})
    const saved = new Map() // cheie rand -> id
    const failed = {}

    // secvential, nu in paralel: la sali, fiecare modificare ruleaza un trigger
    // care actualizeaza cursurile - in paralel, doua sali din acelasi curs s-ar
    // putea bloca reciproc
    for (const r of dirtyRows) {
      const fields = r.id ? analysis[r.key].changed : ['name', ...extraColumns.map((c) => c.key), 'active']
      const payload = {}
      for (const f of fields) {
        if (f === 'name') payload.name = norm(r.draft.name)
        else if (f === 'active') payload.active = r.draft.active
        else {
          const col = extraColumns.find((c) => c.key === f)
          const v = norm(r.draft[f])
          payload[f] = v === '' ? null : col.type === 'number' ? Number(v) : v
        }
      }
      if (r.id) {
        const { error } = await supabase.from(table).update(payload).eq('id', r.id)
        if (error) failed[r.key] = friendlyError(error)
        else saved.set(r.key, r.id)
      } else {
        const { data, error } = await supabase.from(table).insert(payload).select().single()
        if (error) failed[r.key] = friendlyError(error)
        else saved.set(r.key, data.id)
      }
    }

    setRows((prev) =>
      prev.map((r) => {
        if (!saved.has(r.key)) return r
        const clean = {
          name: norm(r.draft.name),
          ...Object.fromEntries(extraColumns.map((c) => [c.key, norm(r.draft[c.key])])),
          active: r.draft.active,
        }
        return { ...r, id: saved.get(r.key), original: clean, draft: { ...clean } }
      })
    )
    setServerErrors(failed)
    setSaving(false)
    const failedCount = Object.keys(failed).length
    setMessage(`Salvate: ${saved.size}${failedCount ? `. Esuate: ${failedCount} (marcate cu rosu mai jos)` : '.'}`)
    await onSaved?.()
  }

  function discardAll() {
    if (dirtyRows.length > 0 && !confirm('Renunti la toate modificarile nesalvate?')) return
    setRows((prev) => prev.filter((r) => r.id).map((r) => ({ ...r, draft: { ...r.original } })))
    setServerErrors({})
    setMessage('')
  }

  function handleClose() {
    if (dirtyRows.length > 0 && !confirm('Ai modificari nesalvate. Le pierzi si inchizi editarea rapida?')) return
    onClose()
  }

  // avertizare daca inchizi/reimprospatezi pagina cu modificari nesalvate
  useEffect(() => {
    if (dirtyRows.length === 0) return undefined
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirtyRows.length])

  const failedRows = rows.filter((r) => serverErrors[r.key])

  return (
    <div
      className="list-grid-root"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          saveAll()
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          addRow()
        }
      }}
    >
      <div className="list-grid-bar">
        <input
          className="list-grid-search"
          placeholder="Cauta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="secondary-btn" onClick={addRow} disabled={saving}>+ Rand nou</button>
        <span className="list-grid-status">
          {dirtyRows.length > 0 ? `${dirtyRows.length} modificari nesalvate` : 'Nicio modificare'}
          {errorCount > 0 ? ` · ${errorCount} cu erori` : ''}
        </span>
        <button type="button" onClick={saveAll} disabled={saving || dirtyRows.length === 0}>
          {saving ? 'Se salveaza...' : 'Salveaza toate'}
        </button>
        <button type="button" className="secondary-btn" onClick={discardAll} disabled={saving || dirtyRows.length === 0}>
          Renunta
        </button>
        <button type="button" className="secondary-btn" onClick={handleClose} disabled={saving}>Inchide</button>
      </div>
      <p className="admin-hint">
        Tab / Shift+Tab: celula urmatoare / anterioara · Enter / Shift+Enter: jos / sus · sageti: deplasare ·
        Space: bifeaza "Activ" · Esc: anuleaza celula · Ctrl+Enter: rand nou · Ctrl+S: salveaza toate.
        Modificarile se salveaza doar cand apesi "Salveaza toate".
      </p>
      {message && <div className="auth-info">{message}</div>}
      {failedRows.length > 0 && (
        <div className="auth-error">
          Nu s-au putut salva:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {failedRows.map((r) => <li key={r.key}>{r.draft.name || '(fara nume)'}: {serverErrors[r.key]}</li>)}
          </ul>
        </div>
      )}

      <div className="list-grid-wrap">
        <table className="list-grid">
          <thead>
            <tr>
              <th>Nume</th>
              {extraColumns.map((c) => <th key={c.key}>{c.label}</th>)}
              <th>Activ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, rowIdx) => {
              const info = analysis[r.key] || { changed: [], errors: {} }
              const cellClass = (field) => {
                if (info.errors[field] || (field === 'name' && serverErrors[r.key])) return 'cell-error'
                return info.changed.includes(field) ? 'cell-dirty' : ''
              }
              const cellTitle = (field) =>
                info.errors[field] || (field === 'name' ? serverErrors[r.key] : '') || undefined
              return (
                <tr key={r.key} className={`${r.draft.active ? '' : 'row-inactive'} ${r.id ? '' : 'row-new'}`}>
                  <td className={cellClass('name')} title={cellTitle('name')}>
                    <input
                      type="text"
                      ref={(el) => setCellRef(r.key, 0, el)}
                      value={r.draft.name}
                      disabled={saving}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateDraft(r.key, 'name', e.target.value)}
                      onKeyDown={(e) => onCellKeyDown(e, r, rowIdx, 0)}
                    />
                  </td>
                  {extraColumns.map((c, i) => (
                    <td key={c.key} className={cellClass(c.key)} title={cellTitle(c.key)}>
                      <input
                        type="text"
                        inputMode={c.type === 'number' ? 'numeric' : undefined}
                        ref={(el) => setCellRef(r.key, i + 1, el)}
                        value={r.draft[c.key]}
                        disabled={saving}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateDraft(r.key, c.key, e.target.value)}
                        onKeyDown={(e) => onCellKeyDown(e, r, rowIdx, i + 1)}
                      />
                    </td>
                  ))}
                  <td className={`list-grid-check ${cellClass('active')}`}>
                    <input
                      type="checkbox"
                      ref={(el) => setCellRef(r.key, totalCols - 1, el)}
                      checked={r.draft.active}
                      disabled={saving}
                      onChange={(e) => updateDraft(r.key, 'active', e.target.checked)}
                      onKeyDown={(e) => onCellKeyDown(e, r, rowIdx, totalCols - 1)}
                    />
                  </td>
                  <td>
                    {!r.id && (
                      <button type="button" className="link-btn" tabIndex={-1} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
                        scoate
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
