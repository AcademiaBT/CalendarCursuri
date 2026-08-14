import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { toISODate } from '../../utils/dateHelpers'
import DateInputRO from '../DateInputRO'

const COURSE_TYPES = ['TBD', 'live', 'online', 'blended', 'e-learning']
const TBD_OPTION = { id: 'tbd', name: 'TBD', active: true }

// Doar aceste campuri apartin formularului. Cursul incarcat din baza de date
// (prin select('*')) mai contine si alte coloane - id, created_at, created_by,
// si "period" (coloana calculata automat, folosita pentru garantia anti-
// suprapunere) - care nu trebuie niciodata retrimise la salvare: Postgres
// refuza scrierea directa pe coloana calculata, iar restul nu apartin
// formularului editabil.
const FORM_FIELDS = [
  'name', 'course_type', 'start_date', 'end_date', 'start_time', 'end_time',
  'trainer', 'room', 'participants_group', 'participants_count',
  'responsible', 'invite_mail', 'catering', 'notes', 'course_area', 'target_audience',
]

// trainer/sala/tip curs sunt obligatorii; cursurile mai vechi, salvate inainte
// de aceasta regula, pot avea valoarea goala - le tratam ca "TBD" la afisare
function pickFormFields(source) {
  const result = {}
  for (const key of FORM_FIELDS) {
    result[key] = source[key] ?? ''
  }
  if (!result.trainer) result.trainer = 'TBD'
  if (!result.room) result.room = 'TBD'
  if (!result.course_type) result.course_type = 'TBD'
  return result
}

const emptyForm = (startDate) => ({
  name: '',
  course_type: 'TBD',
  start_date: startDate,
  end_date: startDate,
  start_time: '09:00',
  end_time: '17:00',
  trainer: 'TBD',
  room: 'TBD',
  participants_group: '',
  participants_count: '',
  responsible: '',
  invite_mail: '',
  catering: '',
  notes: '',
  course_area: '',
  target_audience: '',
})

export default function CourseModal({ initialDate, course, onClose, onSaved }) {
  const { user, isAdmin } = useAuth()
  const [form, setForm] = useState(course ? pickFormFields(course) : emptyForm(toISODate(initialDate)))
  const [trainers, setTrainers] = useState([])
  const [rooms, setRooms] = useState([])
  const [responsiblePersons, setResponsiblePersons] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isEditing = Boolean(course?.id)
  const canEdit = !isEditing || isAdmin || course.created_by === user?.id

  useEffect(() => {
    supabase.from('trainers').select('*').order('name').then(({ data }) => setTrainers(data || []))
    supabase.from('rooms').select('*').order('name').then(({ data }) => setRooms(data || []))
    supabase.from('responsible_persons').select('*').order('name').then(({ data }) => setResponsiblePersons(data || []))
  }, [])

  // Sala/trainerul unui curs se salveaza ca text simplu, deci istoricul nu se pierde
  // niciodata cand dezactivezi sau stergi un element din lista. Aici doar ne asiguram
  // ca dropdown-ul arata mereu si valoarea deja atribuita cursului (chiar daca a fost
  // between timp dezactivata sau stearsa din lista), ca sa nu para "disparuta" la editare.
  function optionsFor(list, currentValue) {
    const visible = list.filter((item) => item.active || item.name === currentValue)
    const stillMissing = currentValue && currentValue !== 'TBD' && !list.some((item) => item.name === currentValue)
    if (stillMissing) {
      visible.unshift({ id: `deleted-${currentValue}`, name: currentValue, active: false, deleted: true })
    }
    return [TBD_OPTION, ...visible]
  }

  const trainerOptions = optionsFor(trainers, form.trainer)
  const roomOptions = optionsFor(rooms, form.room)

  // "Responsabil" ramane optional (nu are TBD, spre deosebire de trainer/sala),
  // dar pastreaza acelasi mecanism de siguranta pentru valori vechi (nume care
  // nu mai sunt in lista activa raman totusi vizibile la editare).
  function responsibleOptionsFor(list, currentValue) {
    const visible = list.filter((item) => item.active || item.name === currentValue)
    const stillMissing = currentValue && !list.some((item) => item.name === currentValue)
    if (stillMissing) {
      visible.unshift({ id: `deleted-${currentValue}`, name: currentValue, active: false, deleted: true })
    }
    return visible
  }
  const responsibleOptions = responsibleOptionsFor(responsiblePersons, form.responsible)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function findFieldConflict(field, value) {
    if (!value || value === 'TBD') return null

    let query = supabase
      .from('courses')
      .select('id, name, start_date, end_date, start_time, end_time')
      .eq(field, value)
      .lte('start_date', form.end_date)
      .gte('end_date', form.start_date)

    if (isEditing) query = query.neq('id', course.id)

    const { data, error } = await query
    if (error) throw error

    return (data || []).find((c) => {
      // fara ora precizata pe una din cele doua programari => consideram conflict pe toata ziua
      if (!form.start_time || !form.end_time || !c.start_time || !c.end_time) return true
      return c.start_time < form.end_time && form.start_time < c.end_time
    }) || null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.end_date < form.start_date) {
      setError('Data de sfarsit nu poate fi inainte de data de start.')
      return
    }

    setBusy(true)

    try {
      const roomConflict = await findFieldConflict('room', form.room)
      if (roomConflict) {
        setError(
          `Sala "${form.room}" este deja rezervata in aceasta perioada de cursul "${roomConflict.name}" ` +
          `(${roomConflict.start_date} - ${roomConflict.end_date}${roomConflict.start_time ? `, ${roomConflict.start_time.slice(0, 5)}-${roomConflict.end_time?.slice(0, 5)}` : ''}). ` +
          `Alege alta sala sau alt interval.`
        )
        setBusy(false)
        return
      }

      const trainerConflict = await findFieldConflict('trainer', form.trainer)
      if (trainerConflict) {
        setError(
          `Trainerul "${form.trainer}" este deja programat in aceasta perioada la cursul "${trainerConflict.name}" ` +
          `(${trainerConflict.start_date} - ${trainerConflict.end_date}${trainerConflict.start_time ? `, ${trainerConflict.start_time.slice(0, 5)}-${trainerConflict.end_time?.slice(0, 5)}` : ''}). ` +
          `Alege alt trainer sau alt interval.`
        )
        setBusy(false)
        return
      }
    } catch (err) {
      setError(err.message || 'Nu am putut verifica disponibilitatea salii/trainerului.')
      setBusy(false)
      return
    }

    const payload = {
      ...form,
      participants_count: form.participants_count ? Number(form.participants_count) : null,
    }

    try {
      if (isEditing) {
        const { error } = await supabase.from('courses').update(payload).eq('id', course.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('courses').insert({ ...payload, created_by: user.id })
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      const rawMessage = err.message || ''
      const isRoomRace = err.code === '23P01' && rawMessage.includes('courses_no_room_overlap')
      const isTrainerRace = err.code === '23P01' && rawMessage.includes('courses_no_trainer_overlap')
      if (isRoomRace) {
        setError(
          'Sala tocmai a fost rezervata de altcineva, chiar in acest interval (coliziune detectata la salvare, ' +
          'din doua programari simultane). Inchide fereastra, reincarca calendarul si alege alta sala sau alt interval.'
        )
      } else if (isTrainerRace) {
        setError(
          'Trainerul tocmai a fost programat de altcineva, chiar in acest interval (coliziune detectata la salvare, ' +
          'din doua programari simultane). Inchide fereastra, reincarca calendarul si alege alt trainer sau alt interval.'
        )
      } else {
        setError(rawMessage || 'Nu am putut salva cursul.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Sigur vrei sa stergi acest curs?')) return
    setBusy(true)
    const { error } = await supabase.from('courses').delete().eq('id', course.id)
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Editeaza curs' : 'Adauga curs'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="course-form">
          <label className="span-2">
            Denumire curs *
            <input required disabled={!canEdit} value={form.name} onChange={(e) => update('name', e.target.value)} />
          </label>

          <label className="span-2-of-3">
            Data + ora start *
            <div className="datetime-row">
              <DateInputRO required disabled={!canEdit} value={form.start_date} onChange={(v) => update('start_date', v)} />
              <input type="time" disabled={!canEdit} value={form.start_time || ''} onChange={(e) => update('start_time', e.target.value)} />
            </div>
          </label>
          <label>
            Trainer *
            <select required disabled={!canEdit} value={form.trainer || 'TBD'} onChange={(e) => update('trainer', e.target.value)}>
              {trainerOptions.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}{!t.active ? (t.deleted ? ' (sters din lista)' : ' (inactiv)') : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2-of-3">
            Data + ora sfarsit *
            <div className="datetime-row">
              <DateInputRO required disabled={!canEdit} value={form.end_date} onChange={(v) => update('end_date', v)} />
              <input type="time" disabled={!canEdit} value={form.end_time || ''} onChange={(e) => update('end_time', e.target.value)} />
            </div>
          </label>
          <label>
            Sala *
            <select required disabled={!canEdit} value={form.room || 'TBD'} onChange={(e) => update('room', e.target.value)}>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}{r.capacity ? ` (${r.capacity} locuri)` : ''}{!r.active ? (r.deleted ? ' (sters din lista)' : ' (inactiv)') : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tip curs *
            <select required disabled={!canEdit} value={form.course_type || 'TBD'} onChange={(e) => update('course_type', e.target.value)}>
              {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            Nr. participanti
            <input type="number" min="0" disabled={!canEdit} value={form.participants_count || ''} onChange={(e) => update('participants_count', e.target.value)} />
          </label>

          <label>
            Grup participanti
            <input disabled={!canEdit} value={form.participants_group || ''} onChange={(e) => update('participants_group', e.target.value)} />
          </label>

          <label>
            Responsabil
            <select disabled={!canEdit} value={form.responsible || ''} onChange={(e) => update('responsible', e.target.value)}>
              <option value="">-- alege responsabil --</option>
              {responsibleOptions.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}{!r.active ? (r.deleted ? ' (sters din lista)' : ' (inactiv)') : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            Mail invitare
            <input disabled={!canEdit} value={form.invite_mail || ''} onChange={(e) => update('invite_mail', e.target.value)} />
          </label>

          <label>
            Catering
            <input disabled={!canEdit} value={form.catering || ''} onChange={(e) => update('catering', e.target.value)} />
          </label>

          <label>
            Arie curs / categorie
            <input disabled={!canEdit} value={form.course_area || ''} onChange={(e) => update('course_area', e.target.value)} placeholder="ex: Soft skills, Tehnic, Conformitate" />
          </label>

          <label>
            Public tinta
            <input disabled={!canEdit} value={form.target_audience || ''} onChange={(e) => update('target_audience', e.target.value)} placeholder="ex: Manageri, Noi angajati" />
          </label>

          <label className="span-2">
            Observatii
            <textarea disabled={!canEdit} value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} rows={2} />
          </label>

          {error && <div className="auth-error span-2">{error}</div>}

          <div className="modal-actions span-2">
            {isEditing && canEdit && (
              <button type="button" className="danger-btn" onClick={handleDelete} disabled={busy}>
                Sterge
              </button>
            )}
            <div className="spacer" />
            <button type="button" className="secondary-btn" onClick={onClose}>Anuleaza</button>
            {canEdit && (
              <button type="submit" disabled={busy}>{busy ? 'Se salveaza...' : 'Salveaza'}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
