import { useEffect, useState } from 'react'
import { format, addDays } from 'date-fns'
import { ro } from 'date-fns/locale'
import { supabase } from '../../supabaseClient'
import { toISODate } from '../../utils/dateHelpers'

// La logare, dacă userul e marcat ca "responsabil" (vezi Setări) pentru
// cursuri care încep în curând și încă au trainer/sală "TBD" (nedecise),
// arată un pop-up de atenționare. Click pe un curs îl deschide direct
// pentru editare, iar alerta se micșorează într-un colț (nu dispare de
// tot), ca userul să știe că mai are de rezolvat și altele, pe măsură ce
// le clarifică pe rând. Dispare complet doar la "Am înțeles", sau automat
// cand toate cursurile au fost clarificate.
export default function TbdAlertModal({ profile, refreshKey, onEditCourse }) {
  const [pendingCourses, setPendingCourses] = useState(null) // null = nu s-a verificat inca
  const [dismissed, setDismissed] = useState(false) // "Am inteles" - ascunde pentru restul sesiunii
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    if (!profile?.responsible_name) return

    const todayIso = toISODate(new Date())
    const untilIso = toISODate(addDays(new Date(), profile.notify_days_ahead || 7))

    supabase
      .from('courses')
      .select('*')
      .eq('responsible', profile.responsible_name)
      .gte('start_date', todayIso)
      .lte('start_date', untilIso)
      .or('trainer.eq.TBD,room.eq.TBD')
      .order('start_date', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setPendingCourses(data || [])
      })
    // se reverifica la montare si de fiecare data cand se salveaza un curs
    // oriunde in aplicatie (vezi refreshKey), ca sa dispara automat cele
    // deja rezolvate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.responsible_name, profile?.notify_days_ahead, refreshKey])

  if (dismissed) return null
  if (!pendingCourses || pendingCourses.length === 0) return null

  function handleCourseClick(course) {
    setMinimized(true)
    onEditCourse(course)
  }

  if (minimized) {
    return (
      <button className="tbd-alert-badge" onClick={() => setMinimized(false)}>
        ⚠️ {pendingCourses.length} {pendingCourses.length === 1 ? 'curs neclarificat' : 'cursuri neclarificate'}
      </button>
    )
  }

  return (
    <div className="modal-backdrop" onClick={() => setDismissed(true)}>
      <div className="modal-card tbd-alert-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚠️ Cursuri neclarificate, în curând</h2>
          <button className="icon-btn" onClick={() => setDismissed(true)}>✕</button>
        </div>
        <p className="admin-hint">
          Ești responsabil pentru {pendingCourses.length === 1 ? 'acest curs' : `aceste ${pendingCourses.length} cursuri`},
          {' '}care {pendingCourses.length === 1 ? 'începe' : 'încep'} în următoarele {profile.notify_days_ahead || 7} zile,
          dar încă {pendingCourses.length === 1 ? 'are' : 'au'} trainer și/sau sală nedecise (TBD).
          Click pe un curs ca să-l editezi direct.
        </p>
        <div className="day-detail-list">
          {pendingCourses.map((c) => (
            <div
              key={c.id}
              className="day-detail-item tbd-alert-item"
              onClick={() => handleCourseClick(c)}
            >
              <div className="day-detail-item-title">
                <strong>{format(new Date(c.start_date), 'd MMM', { locale: ro })}</strong> {c.name}
              </div>
              <div className="day-detail-item-sub">
                Trainer: <strong>{c.trainer || 'TBD'}</strong> · Sala: <strong>{c.room || 'TBD'}</strong>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <div className="spacer" />
          <button onClick={() => setDismissed(true)}>Am înțeles</button>
        </div>
      </div>
    </div>
  )
}
