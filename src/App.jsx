import './App.css'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Map from './pages/Map'
import Home from './pages/Home'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

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
        <Route path="/map" element={session ? <Map key={session.user.id} /> : <Navigate to="/login" replace />}/>
        <Route path="/" element={<Home session={session} />}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
