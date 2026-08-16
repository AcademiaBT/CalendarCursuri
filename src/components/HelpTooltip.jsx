import { useState } from 'react'

// Iconita "?" cu explicatie, controlata explicit prin click - se deschide la
// click (functioneaza identic pe desktop si mobil, spre deosebire de hover,
// care nu exista deloc la atingere pe telefon) si se inchide fie la un nou
// click pe ea, fie automat cand userul apasa/atinge in alta parte (onBlur).
// "align" alege in ce parte se deschide caseta de text, ca sa nu iasa din
// ecran cand iconita e aproape de marginea din dreapta.
export default function HelpTooltip({ text, align = 'left' }) {
  const [open, setOpen] = useState(false)

  return (
    <span className={`help-tooltip help-tooltip-${align}`}>
      <button
        type="button"
        className="help-tooltip-icon"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && <span className="help-tooltip-text">{text}</span>}
    </span>
  )
}
