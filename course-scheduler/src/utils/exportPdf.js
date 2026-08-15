import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const HEADERS = [
  'Curs', 'Tip', 'Start', 'Sfarsit', 'Interval orar', 'Trainer', 'Sala',
  'Participanti', 'Nr.', 'Responsabil',
]

export function exportCoursesToPdf(courses, { title = 'Raport cursuri', filtersLabel = '' } = {}) {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(14)
  doc.text(title, 14, 15)
  if (filtersLabel) {
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(filtersLabel, 14, 21)
  }

  const rows = courses.map((c) => [
    c.name,
    c.course_type || '-',
    c.start_date,
    c.end_date,
    `${c.start_time?.slice(0, 5) || ''}-${c.end_time?.slice(0, 5) || ''}`,
    c.trainer || '-',
    c.room || '-',
    c.participants_group || '-',
    c.participants_count ?? '-',
    c.responsible || '-',
  ])

  autoTable(doc, {
    head: [HEADERS],
    body: rows,
    startY: filtersLabel ? 26 : 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 90] },
  })

  doc.save(`raport-cursuri-${new Date().toISOString().slice(0, 10)}.pdf`)
}
