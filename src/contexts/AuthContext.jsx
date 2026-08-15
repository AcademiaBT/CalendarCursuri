import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase reinnoieste automat sesiunea (TOKEN_REFRESHED) cand tab-ul
      // redevine vizibil, chiar daca userul ramane logat - nu e o logare noua.
      // Daca am trata-o ca atare, am pune loading=true, ceea ce demonteaza
      // complet <CalendarPage> (App.jsx randeaza doar ecranul de loading cat
      // timp loading e true) si orice stare locala din ea se pierde - de
      // exemplu alerta TBD minimizata reapare intreaga. Aici doar actualizam
      // sesiunea, fara sa atingem loading/profilul.
      if (event === 'TOKEN_REFRESHED') {
        setSession(session)
        return
      }

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
