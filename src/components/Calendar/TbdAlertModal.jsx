import { useEffect, useState } from 'react'
import { format, addDays } from 'date-fns'
import { ro } from 'date-fns/locale'
import { supabase } from '../../supabaseClient'
import { toISODate } from '../../utils/dateHelpers'

// La logare, dacă userul e marcat ca "responsabil" (vezi Setări) pentru
// cursuri care încep în curând și încă au trainer/sală "TBD" (nedecise),
// arată un pop-up de atenționare. Verifică o singură dată pe sesiune
// (nu la fiecare navigare), ca să nu devină enervant.
export default function TbdAlertModal({ profile }) {
  const [pendingCourses, setPendingCourses] = useState(null) // null = nu s-a verificat inca

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
    // se verifica o singura data, la montarea paginii (dupa logare / reincarcare)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!pendingCourses || pendingCourses.length === 0) return null

  return (
    <div className="modal-backdrop" onClick={() => setPendingCourses([])}>
      <div className="modal-card tbd-alert-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚠️ Cursuri neclarificate, în curând</h2>
          <button className="icon-btn" onClick={() => setPendingCourses([])}>✕</button>
        </div>
        <p className="admin-hint">
          Ești responsabil pentru {pendingCourses.length === 1 ? 'acest curs' : `aceste ${pendingCourses.length} cursuri`},
          {' '}care {pendingCourses.length === 1 ? 'începe' : 'încep'} în următoarele {profile.notify_days_ahead || 7} zile,
          dar încă {pendingCourses.length === 1 ? 'are' : 'au'} trainer și/sau sală nedecise (TBD).
        </p>
        <div className="day-detail-list">
          {pendingCourses.map((c) => (
            <div key={c.id} className="day-detail-item tbd-alert-item">
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
          <button onClick={() => setPendingCourses([])}>Am înțeles</button>
        </div>
      </div>
    </div>
  )
}
