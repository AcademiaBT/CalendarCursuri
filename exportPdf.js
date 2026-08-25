import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const HEADERS = [
  'Curs', 'Tip', 'Start', 'Sfarsit', 'Interval orar', 'Trainer', 'Sala',
  'Participanti', 'Nr.', 'Responsabil', 'Categorie', 'Public tinta',
]

// indicii coloanelor care pot avea valoarea "TBD" (neclarificat), si campul
// brut din curs care le corespunde - folosite ca sa marcam cu rosu/bold
const TBD_COLUMNS = { 1: 'course_type', 5: 'trainer', 6: 'room', 9: 'responsible' }

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
    c.course_area || '-',
    c.target_audience || '-',
  ])

  autoTable(doc, {
    head: [HEADERS],
    body: rows,
    startY: filtersLabel ? 26 : 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 90] },
    // valorile TBD/neclarificate (tip, trainer, sala, responsabil) apar cu
    // rosu si bold, ca sa fie evident dintr-o privire ce mai e de rezolvat
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const field = TBD_COLUMNS[data.column.index]
      if (!field) return
      const value = courses[data.row.index][field]
      if (!value || value === 'TBD') {
        data.cell.styles.textColor = [220, 53, 69]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(`raport-cursuri-${new Date().toISOString().slice(0, 10)}.pdf`)
}
