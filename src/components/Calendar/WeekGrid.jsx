import { format, isToday as checkIsToday } from 'date-fns'
import { ro } from 'date-fns/locale'
import { toISODate, formatWeekRangeTitle } from '../../utils/dateHelpers'
import { getBarStyle } from '../../utils/colors'

// Gaseste in ce coloane (0-6, Luni-Duminica) ar trebui desenata bara unui
// curs in aceasta saptamana, "taiata" la marginile saptamanii daca cursul
// incepe inainte sau se termina dupa aceasta saptamana. Semnaleaza si daca
// bara e o continuare (nu chiar inceputul/sfarsitul real al cursului), ca
// sa putem desena sagetile de continuare.
function courseSpanInWeek(course, weekDays) {
  const weekStartIso = toISODate(weekDays[0])
  const weekEndIso = toISODate(weekDays[6])
  const continuesFromPrevious = course.start_date < weekStartIso
  const continuesToNext = course.end_date > weekEndIso
  const clippedStart = continuesFromPrevious ? weekStartIso : course.start_date
  const clippedEnd = continuesToNext ? weekEndIso : course.end_date
  const startIdx = weekDays.findIndex((d) => toISODate(d) === clippedStart)
  const endIdx = weekDays.findIndex((d) => toISODate(d) === clippedEnd)
  return {
    startIdx: Math.max(startIdx, 0),
    endIdx: Math.max(endIdx, 0),
    continuesFromPrevious,
    continuesToNext,
  }
}

// Etichetele si sursa de date pentru fiecare camp optional, afisabil pe bara
// (pe langa denumire, care e mereu vizibila). Folosit si de pagina de
// Setari, ca sa ramana o singura sursa de adevar pentru lista de campuri.
export const BAR_FIELD_OPTIONS = [
  { key: 'time', label: 'Ora', getValue: (c) => (c.start_time ? c.start_time.slice(0, 5) : '') },
  { key: 'trainer', label: 'Trainer', getValue: (c) => c.trainer || '' },
  { key: 'room', label: 'Sala', getValue: (c) => c.room || '' },
  { key: 'responsible', label: 'Responsabil', getValue: (c) => c.responsible || '' },
  { key: 'course_type', label: 'Tip curs', getValue: (c) => c.course_type || '' },
  { key: 'participants_count', label: 'Nr. participanti', getValue: (c) => (c.participants_count ? String(c.participants_count) : '') },
  { key: 'start_date', label: 'Data start', getValue: (c) => c.start_date || '' },
]

function CourseBar({ course, weekDays, barFields, colorPrefs, rowIndex, onCourseClick, onCourseHover, onCourseLeave }) {
  const { startIdx, endIdx, continuesFromPrevious, continuesToNext } = courseSpanInWeek(course, weekDays)
  const style = getBarStyle(course, colorPrefs)

  const extraFieldsText = BAR_FIELD_OPTIONS
    .filter((f) => barFields.includes(f.key) && f.key !== 'time')
    .map((f) => f.getValue(course))
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="week-course-bar"
      style={{
        gridColumn: `${startIdx + 1} / ${endIdx + 2}`,
        gridRow: rowIndex + 1,
        background: style.bg,
        borderLeft: continuesFromPrevious ? 'none' : `4px solid ${style.border}`,
        color: style.text,
      }}
      onMouseEnter={(e) => onCourseHover(e, course)}
      onMouseLeave={onCourseLeave}
      onClick={() => onCourseClick(course)}
    >
      {continuesFromPrevious && <span className="week-course-bar-arrow" title="Continua din saptamana anterioara">◀</span>}
      <span className="week-course-bar-text">
        {barFields.includes('time') && course.start_time && (
          <span className="week-course-bar-time">{course.start_time.slice(0, 5)}</span>
        )}
        {' '}
        <span className="week-course-bar-name">{course.name}</span>
        {extraFieldsText && <span className="week-course-bar-extra"> — {extraFieldsText}</span>}
      </span>
      {continuesToNext && <span className="week-course-bar-arrow" title="Continua saptamana urmatoare">▶</span>}
    </div>
  )
}

// Un singur "bloc" saptamanal: antet cu cele 7 zile + rândurile Gantt cu
// cursurile care ating acea saptamana. CalendarPage stivuieste mai multe
// astfel de blocuri, unul sub altul, pentru derulare verticala continua
// (ca in Excel).
export default function WeekGrid({ weekDays, courses, barFields, colorPrefs, onDayHeaderClick, onCourseClick, onCourseHover, onCourseLeave }) {
  const weekStartIso = toISODate(weekDays[0])
  const weekEndIso = toISODate(weekDays[6])
  const weekCourses = courses
    .filter((c) => c.start_date <= weekEndIso && c.end_date >= weekStartIso)
    .sort((a, b) => {
      if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date)
      const ta = a.start_time || '00:00'
      const tb = b.start_time || '00:00'
      return ta.localeCompare(tb)
    })

  return (
    <div className="week-grid-wrapper">
      <div className="week-block-label">{formatWeekRangeTitle(weekDays)}</div>

      <div className="week-grid-header">
        {weekDays.map((date) => (
          <div
            key={date.toISOString()}
            className={`week-day-header ${checkIsToday(date) ? 'week-day-header-today' : ''}`}
            onClick={() => onDayHeaderClick(date)}
          >
            <div className="week-day-header-name">{format(date, 'EEEE', { locale: ro })}</div>
            <div className="week-day-header-date">{format(date, 'd MMM', { locale: ro })}</div>
          </div>
        ))}
      </div>

      {weekCourses.length === 0 ? (
        <div className="week-grid-empty">Niciun curs programat in aceasta saptamana.</div>
      ) : (
        <div
          className="week-grid-body"
          style={{ gridTemplateRows: `repeat(${weekCourses.length}, minmax(22px, auto))` }}
        >
          {weekCourses.map((c, rowIndex) => (
            <CourseBar
              key={c.id}
              course={c}
              weekDays={weekDays}
              barFields={barFields}
              colorPrefs={colorPrefs}
              rowIndex={rowIndex}
              onCourseClick={onCourseClick}
              onCourseHover={onCourseHover}
              onCourseLeave={onCourseLeave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
