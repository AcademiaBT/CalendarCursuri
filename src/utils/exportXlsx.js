import * as XLSX from 'xlsx'

export function exportCoursesToXlsx(courses) {
  const rows = courses.map((c) => ({
    'Denumire curs': c.name,
    'Tip curs': c.course_type || '',
    'Data start': c.start_date,
    'Data sfarsit': c.end_date,
    'Ora start': c.start_time?.slice(0, 5) || '',
    'Ora sfarsit': c.end_time?.slice(0, 5) || '',
    'Trainer': c.trainer || '',
    'Sala': c.room || '',
    'Participanti (grup)': c.participants_group || '',
    'Nr. participanti': c.participants_count ?? '',
    'Responsabil': c.responsible || '',
    'Mail invitare': c.invite_mail || '',
    'Catering': c.catering || '',
    'Observatii': c.notes || '',
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cursuri')

  XLSX.writeFile(workbook, `raport-cursuri-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
