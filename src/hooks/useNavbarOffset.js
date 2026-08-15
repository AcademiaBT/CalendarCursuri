import { useEffect, useState } from 'react'

// Trebuie sa corespunda cu breakpoint-ul mobil din index.css (@media max-width: 720px)
const MOBILE_BREAKPOINT = 720

// Masoara inaltimea reala a barei de meniu (.navbar) - variaza pe mobil,
// cand meniul se rupe pe mai multe randuri. Recalculat la redimensionarea
// ferestrei/rotirea telefonului. Bara e acum "sticky" (mereu vizibila, sus),
// deci orice element care trebuie sa stea chiar sub ea (sau centrat pe ea)
// foloseste acest hook, ca sa nu se suprapuna niciodata cu ea.
export default function useNavbarOffset() {
  const [height, setHeight] = useState(60)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT)

  useEffect(() => {
    function update() {
      const nav = document.querySelector('.navbar')
      setHeight(nav ? nav.getBoundingClientRect().height : 60)
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return {
    height,
    center: height / 2,
    // pe mobil bara se poate rupe pe 2-3 randuri (meniu + user pe randuri
    // separate), deci "centrul" ei ar putea cadea peste text - mai sigur
    // sa punem elementul chiar sub bara intreaga, nu suprapus pe ea
    isMobile,
  }
}
