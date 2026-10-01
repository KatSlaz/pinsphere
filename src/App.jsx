import './App.css'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Map from './pages/Map'
import Home from './pages/Home'
import Settings from './pages/Settings'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { usePreferences } from './usePreferences'

function App() {
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const { theme, mapStyle, changeTheme, changeMapStyle, syncStatus, retrySync } = usePreferences(session?.user.id)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = event => setSystemDark(event.matches)
    media.addEventListener('change', handleSystemChange)
    return () => {
      media.removeEventListener('change', handleSystemChange)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.themePreference = theme
    root.dataset.theme = resolvedTheme
    root.style.colorScheme = resolvedTheme
    root.style.backgroundColor = resolvedTheme === 'dark' ? '#16171d' : '#fff'
  }, [theme, resolvedTheme])

  useEffect(() => {
    // INITIAL_SESSION arrives after Supabase restores/refreshes the saved session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoadingSession(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loadingSession) {
    return <p>Loading...</p>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signup" element={session ? <Navigate to="/map" replace /> : <Signup />}/>
        <Route path="/login" element={session ? <Navigate to="/map" replace /> : <Login />}/>
        <Route path="/map" element={session ? <Map key={session.user.id} mapStyle={mapStyle} /> : <Navigate to="/login" replace />}/>
        <Route path="/settings" element={session ? <Settings theme={theme} onThemeChange={changeTheme} mapStyle={mapStyle} onMapStyleChange={changeMapStyle} syncStatus={syncStatus} onRetrySync={retrySync} /> : <Navigate to="/login" replace />}/>
        <Route path="/" element={<Home session={session} />}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
