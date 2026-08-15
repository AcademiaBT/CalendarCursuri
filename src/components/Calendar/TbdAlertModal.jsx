import { useEffect, useState } from 'react'
import { format, addDays } from 'date-fns'
import { ro } from 'date-fns/locale'
import { supabase } from '../../supabaseClient'
import { toISODate } from '../../utils/dateHelpers'

// La logare, atentioneaza userul despre doua categorii de cursuri apropiate:
// 1) cursurile pentru care userul e "responsabil" (Setari) si care inca au
//    trainer/sala TBD - vizibil doar celui responsabil
// 2) cursuri fara niciun responsabil stabilit (responsible = "TBD") - astea
//    se arata TUTUROR userilor, pana cineva stabileste un responsabil
// Click pe un curs il deschide direct pentru editare, iar alerta se
// micsoreaza intr-un colet (nu dispare de tot), ca userul sa nu piarda din
// vedere ca mai are de rezolvat, in timp ce le clarifica pe rand. Dispare
// complet doar la "Am inteles", sau automat cand toate au fost clarificate.
export default function TbdAlertModal({ profile, refreshKey, onEditCourse }) {
  const [pendingCourses, setPendingCourses] = useState(null) // null = nu s-a verificat inca
  const [dismissed, setDismissed] = useState(false) // "Am inteles" - ascunde pentru restul sesiunii
  const [minimized, setMinimized] = useState(false)
  const [badgeTop, setBadgeTop] = useState(72)

  // pozitioneaza badge-ul mereu chiar sub bara de navigare, indiferent de
  // inaltimea ei reala (variaza pe mobil, cand meniul se rupe pe mai multe
  // randuri) - recalculat si la redimensionarea ferestrei/rotirea telefonului
  useEffect(() => {
    function updateOffset() {
      const nav = document.querySelector('.navbar')
      setBadgeTop((nav ? nav.getBoundingClientRect().height : 60) + 12)
    }
    updateOffset()
    window.addEventListener('resize', updateOffset)
    return () => window.removeEventListener('resize', updateOffset)
  }, [])

  useEffect(() => {
    const todayIso = toISODate(new Date())
    const untilIso = toISODate(addDays(new Date(), profile?.notify_days_ahead || 7))

    const queries = []

    // cursurile mele, cu trainer/sala inca nedecise
    if (profile?.responsible_name) {
      queries.push(
        supabase
          .from('courses')
          .select('*')
          .eq('responsible', profile.responsible_name)
          .gte('start_date', todayIso)
          .lte('start_date', untilIso)
          .or('trainer.eq.TBD,room.eq.TBD')
      )
    }

    // cursuri fara responsabil stabilit - vizibile pentru orice user logat
    queries.push(
      supabase
        .from('courses')
        .select('*')
        .eq('responsible', 'TBD')
        .gte('start_date', todayIso)
        .lte('start_date', untilIso)
    )

    Promise.all(queries).then((results) => {
      const merged = new Map()
      for (const { data, error } of results) {
        if (error) continue
        for (const c of data || []) merged.set(c.id, c)
      }
      setPendingCourses([...merged.values()].sort((a, b) => a.start_date.localeCompare(b.start_date)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.responsible_name, profile?.notify_days_ahead, refreshKey])

  if (dismissed) return null
  if (!pendingCourses || pendingCourses.length === 0) return null

  function missingLabels(c) {
    const missing = []
    if (c.trainer === 'TBD') missing.push('Trainer')
    if (c.room === 'TBD') missing.push('Sala')
    if (c.responsible === 'TBD') missing.push('Responsabil')
    return missing
  }

  function handleCourseClick(course) {
    setMinimized(true)
    onEditCourse(course)
  }

  if (minimized) {
    return (
      <button className="tbd-alert-badge" style={{ top: badgeTop }} onClick={() => setMinimized(false)}>
        ⚠️ {pendingCourses.length} {pendingCourses.length === 1 ? 'curs neclarificat' : 'cursuri neclarificate'}
      </button>
    )
  }

  return (
    <div className="modal-backdrop" onClick={() => setMinimized(true)}>
      <div className="modal-card tbd-alert-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚠️ Cursuri neclarificate, în curând</h2>
          <button className="icon-btn" onClick={() => setDismissed(true)}>✕</button>
        </div>
        <p className="admin-hint">
          {pendingCourses.length === 1 ? 'Acest curs începe' : `Aceste ${pendingCourses.length} cursuri încep`} în
          {' '}următoarele {profile?.notify_days_ahead || 7} zile, dar {pendingCourses.length === 1 ? 'încă are' : 'încă au'}
          {' '}atribute nedecise (TBD). Click pe un curs ca să-l editezi direct.
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
                Lipsesc: <strong>{missingLabels(c).join(', ')}</strong>
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
