import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Tine minte ce user era deja logat, ca sa distingem o logare noua (adevarata)
  // de un eveniment "fals pozitiv" al Supabase - vezi comentariul de mai jos
  const loadedUserId = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadedUserId.current = session?.user?.id ?? null
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase re-emite un eveniment de sesiune (de multe ori SIGNED_IN,
      // uneori TOKEN_REFRESHED) de fiecare data cand tab-ul redevine vizibil,
      // chiar daca userul ramane acelasi de la inceput - e comportament
      // documentat oficial ("including on user sign in and when refocusing
      // a tab"), deci NU ne putem baza pe numele evenimentului. Singurul
      // semnal de incredere e daca s-a schimbat efectiv userul logat.
      // Daca am trata orice eveniment ca logare noua, am pune loading=true,
      // ceea ce demonteaza complet <CalendarPage> (App.jsx randeaza doar
      // ecranul de loading cat timp loading e true) si orice stare locala
      // din ea se pierde - de exemplu alerta TBD minimizata reapare intreaga.
      const newUserId = session?.user?.id ?? null

      if (newUserId === loadedUserId.current) {
        // acelasi user (sau tot delogat) - doar actualizam sesiunea (poate
        // avea token nou), fara sa atingem loading/profilul
        setSession(session)
        return
      }

      loadedUserId.current = newUserId
      setSession(session)
      if (session) {
        // reseteaza "loading", ca ecranul sa astepte profilul nou, nu doar
        // sesiunea - altfel pagina se poate afisa o clipa cu profilul vechi
        // (sau gol), inainte sa soseasca cel corect de la Supabase
        setLoading(true)
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  // Salveaza preferintele personale ale userului (campuri afisate pe bara,
  // mod de colorare, culori alese) direct in profilul lui din Supabase -
  // astfel raman aceleasi indiferent de dispozitivul de pe care se logheaza.
  async function updatePreferences(partial) {
    if (!session?.user) return { error: new Error('Nu esti autentificat.') }
    const { data, error } = await supabase
      .from('profiles')
      .update(partial)
      .eq('id', session.user.id)
      .select()
      .single()
    if (!error) setProfile(data)
    return { data, error }
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin',
    loading,
    signIn,
    signOut,
    updatePreferences,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
