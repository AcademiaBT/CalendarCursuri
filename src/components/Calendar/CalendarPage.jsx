import { useEffect, useMemo, useState, useCallback } from 'react'
import { addMonths, subMonths, addWeeks, subWeeks, format } from 'date-fns'
import { supabase } from '../../supabaseClient'
import {
  buildMonthGrid,
  buildWeekDays,
  formatMonthTitle,
  toISODate,
  coursesForDay,
} from '../../utils/dateHelpers'
import { getBarStyle, DURATION_LEGEND } from '../../utils/colors'
import { useAuth } from '../../contexts/AuthContext'
import CourseModal from './CourseModal'
import MonthGrid from './MonthGrid'
import WeekGrid from './WeekGrid'

// Cate saptamani afisam stivuite, unele sub altele, in vizualizarea
// saptamanala - "Saptamana anterioara/urmatoare" muta toata fereastra cu o
// saptamana, ca un scroll continuu, la fel ca in modelul Excel.
const WEEKS_VISIBLE = 4

export default function CalendarPage() {
  const { profile } = useAuth()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
  const [anchorDate, setAnchorDate] = useState(new Date())
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalState, setModalState] = useState(null) // { initialDate } | { course } | null
  const [hoverInfo, setHoverInfo] = useState(null) // { course, top, left } | null
  const [dayDetail, setDayDetail] = useState(null) // Date | null - ziua pentru care aratam lista completa

  // Preferintele de afisare vin din profilul Supabase al userului (aceleasi
  // pe orice dispozitiv), cu valori implicite rezonabile daca nu s-au
  // configurat inca (profil abia creat).
  const barFields = profile?.week_bar_fields || ['time']
  const colorPrefs = {
    colorMode: profile?.color_mode || 'duration',
    customColors: profile?.custom_colors || {},
  }

  const monthGrid = useMemo(() => buildMonthGrid(anchorDate), [anchorDate])

  const weeksToShow = useMemo(
    () => Array.from({ length: WEEKS_VISIBLE }, (_, i) => buildWeekDays(addWeeks(anchorDate, i))),
    [anchorDate]
  )

  // intervalul vizibil difera dupa mod: toata grila lunara, sau cele N saptamani stivuite
  const rangeStart = viewMode === 'month' ? toISODate(monthGrid[0].date) : toISODate(weeksToShow[0][0])
  const rangeEnd = viewMode === 'month'
    ? toISODate(monthGrid[monthGrid.length - 1].date)
    : toISODate(weeksToShow[weeksToShow.length - 1][6])

  function showHoverDetails(e, course) {
    const rect = e.currentTarget.getBoundingClientRect()
    const popoverWidth = 250
    let left = rect.left
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10
    }
    let top = rect.bottom + 6
    if (top + 180 > window.innerHeight) {
      top = rect.top - 6 - 180
    }
    setHoverInfo({ course, top, left })
  }

  const loadCourses = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .lte('start_date', rangeEnd)
      .gte('end_date', rangeStart)
      .order('start_time', { ascending: true })
    if (!error) setCourses(data || [])
    setLoading(false)
  }, [rangeStart, rangeEnd])

  useEffect(() => {
    loadCourses()
  }, [loadCourses])

  function goToPrevious() {
    setAnchorDate((d) => (viewMode === 'month' ? subMonths(d, 1) : subWeeks(d, 1)))
  }
  function goToNext() {
    setAnchorDate((d) => (viewMode === 'month' ? addMonths(d, 1) : addWeeks(d, 1)))
  }

  const weekRangeTitle = `${format(weeksToShow[0][0], 'd MMM')} – ${format(weeksToShow[weeksToShow.length - 1][6], 'd MMM yyyy')}`

  return (
    <div className={`calendar-page ${viewMode === 'month' ? 'calendar-page-month' : 'calendar-page-week'}`}>
      <div className="calendar-toolbar">
        <button onClick={goToPrevious}>← {viewMode === 'month' ? 'Luna anterioara' : 'Saptamana anterioara'}</button>
        <h2>{viewMode === 'month' ? formatMonthTitle(anchorDate) : weekRangeTitle}</h2>
        <button onClick={goToNext}>{viewMode === 'month' ? 'Luna urmatoare' : 'Saptamana urmatoare'} →</button>
        <button className="secondary-btn" onClick={() => setAnchorDate(new Date())}>Azi</button>

        <div className="view-mode-toggle">
          <button
            className={viewMode === 'month' ? 'view-mode-active' : ''}
            onClick={() => setViewMode('month')}
          >
            Lunar
          </button>
          <button
            className={viewMode === 'week' ? 'view-mode-active' : ''}
            onClick={() => setViewMode('week')}
          >
            Saptamanal
          </button>
        </div>

        <button className="add-course-btn" onClick={() => setModalState({ initialDate: new Date() })}>
          + Adauga curs
        </button>
      </div>

      <div className="legend">
        {colorPrefs.colorMode === 'duration' ? (
          DURATION_LEGEND.map((l) => (
            <span key={l.key} className="legend-item">
              <span className="legend-swatch" style={{ background: l.bg, borderColor: l.border }} />
              {l.label}
            </span>
          ))
        ) : (
          <span className="legend-item legend-note">
            Culori dupa {colorPrefs.colorMode === 'responsible' ? 'responsabil' : 'categorie curs'} — configurabil in Setari
          </span>
        )}
      </div>

      {loading && <div className="loading-bar">Se incarca cursurile...</div>}

      {viewMode === 'month' ? (
        <MonthGrid
          grid={monthGrid}
          courses={courses}
          colorPrefs={colorPrefs}
          onDayClick={(date) => setModalState({ initialDate: date })}
          onCourseClick={(course) => setModalState({ course })}
          onCourseHover={showHoverDetails}
          onCourseLeave={() => setHoverInfo(null)}
          onMoreClick={(date) => setDayDetail(date)}
        />
      ) : (
        <div className="week-stack">
          {weeksToShow.map((weekDays) => (
            <WeekGrid
              key={toISODate(weekDays[0])}
              weekDays={weekDays}
              courses={courses}
              barFields={barFields}
              colorPrefs={colorPrefs}
              onDayHeaderClick={(date) => setModalState({ initialDate: date })}
              onCourseClick={(course) => setModalState({ course })}
              onCourseHover={showHoverDetails}
              onCourseLeave={() => setHoverInfo(null)}
            />
          ))}
        </div>
      )}

      {hoverInfo && (
        <div className="course-hover-popover" style={{ top: hoverInfo.top, left: hoverInfo.left }}>
          <div className="popover-title">{hoverInfo.course.name}</div>
          <div className="popover-row">
            <strong>Perioada:</strong> {hoverInfo.course.start_date} → {hoverInfo.course.end_date}
          </div>
          {hoverInfo.course.start_time && (
            <div className="popover-row">
              <strong>Interval:</strong> {hoverInfo.course.start_time.slice(0, 5)}-{hoverInfo.course.end_time?.slice(0, 5)}
            </div>
          )}
          {hoverInfo.course.trainer && (
            <div className="popover-row"><strong>Trainer:</strong> {hoverInfo.course.trainer}</div>
          )}
          {hoverInfo.course.room && (
            <div className="popover-row"><strong>Sala:</strong> {hoverInfo.course.room}</div>
          )}
          {(hoverInfo.course.participants_group || hoverInfo.course.participants_count) && (
            <div className="popover-row">
              <strong>Participanti:</strong> {hoverInfo.course.participants_group || ''}
              {hoverInfo.course.participants_count ? ` (${hoverInfo.course.participants_count})` : ''}
            </div>
          )}
          {hoverInfo.course.course_type && (
            <div className="popover-row"><strong>Tip:</strong> {hoverInfo.course.course_type}</div>
          )}
          {hoverInfo.course.responsible && (
            <div className="popover-row"><strong>Responsabil:</strong> {hoverInfo.course.responsible}</div>
          )}
        </div>
      )}

      {dayDetail && (
        <div className="modal-backdrop" onClick={() => setDayDetail(null)}>
          <div className="modal-card day-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cursuri – {format(dayDetail, 'dd/MM/yyyy')}</h2>
              <button className="icon-btn" onClick={() => setDayDetail(null)}>✕</button>
            </div>
            <div className="day-detail-list">
              {coursesForDay(courses, dayDetail).map((c) => {
                const style = getBarStyle(c, colorPrefs)
                return (
                  <div
                    key={c.id}
                    className="day-detail-item"
                    style={{ borderLeft: `4px solid ${style.border}` }}
                    onClick={() => {
                      setDayDetail(null)
                      setModalState({ course: c })
                    }}
                  >
                    <div className="day-detail-item-title">
                      <strong>{c.start_time?.slice(0, 5) || ''}</strong> {c.name}
                    </div>
                    <div className="day-detail-item-sub">
                      {c.trainer || '—'} · {c.room || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="modal-actions">
              <div className="spacer" />
              <button
                className="secondary-btn"
                onClick={() => {
                  const clickedDate = dayDetail
                  setDayDetail(null)
                  setModalState({ initialDate: clickedDate })
                }}
              >
                + Adauga curs in aceasta zi
              </button>
            </div>
          </div>
        </div>
      )}

      {modalState && (
        <CourseModal
          initialDate={modalState.initialDate}
          course={modalState.course}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null)
            loadCourses()
          }}
        />
      )}
    </div>
  )
}
