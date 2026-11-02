import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { createAuthSubmission } from '../authForm'
import './AuthForm.css'

export default function AuthForm({ signup = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState({ busy: false, errors: {}, error: '', confirmation: false })
  const submission = useRef(null)
  const emailInput = useRef(null)
  const passwordInput = useRef(null)
  const feedback = useRef(null)
  useEffect(() => {
    const controller = createAuthSubmission({ auth: supabase.auth, signup, onState: setState,
      onAuthenticated: () => { window.location.href = '/map' } })
    submission.current = controller
    return () => controller.dispose()
  }, [signup])
  useEffect(() => {
    if (state.busy) return
    if (state.confirmation || state.error) feedback.current?.focus()
    else if (state.errors.email) emailInput.current?.focus()
    else if (state.errors.password) passwordInput.current?.focus()
  }, [state])
  const title = signup ? 'Create account' : 'Log in'
  return <div className="auth-page">
    <header className="auth-header"><Link className="auth-brand" to="/">PinSphere</Link><Link to="/">Home</Link></header>
    <main className="auth-main">
      <h1>{state.confirmation ? 'Check your email' : title}</h1>
      {state.confirmation ? <div className="auth-confirmation" ref={feedback} tabIndex={-1} role="status">
        <p>If confirmation is needed for this address, check <strong>{email.trim()}</strong> for a confirmation link. Follow it to finish signing in.</p>
        <p>Already have an account? <Link to="/login">Log in</Link></p>
      </div> : <>
        <p className="auth-intro">{signup ? 'Start your personal map of the world.' : 'Continue to your maps and saved places.'}</p>
        <form noValidate aria-label={title} aria-busy={state.busy} onSubmit={event => {
          event.preventDefault()
          void submission.current?.submit({ email, password, emailMismatch: emailInput.current?.validity.typeMismatch })
        }}>
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input ref={emailInput} id="auth-email" name="email" type="email" autoComplete={signup ? 'email' : 'username'} inputMode="email" autoCapitalize="none" spellCheck={false} required readOnly={state.busy}
              value={email} onChange={event => setEmail(event.target.value)} aria-invalid={Boolean(state.errors.email)} aria-describedby={state.errors.email ? 'auth-email-error' : undefined} />
            {state.errors.email && <p id="auth-email-error" className="auth-field-error" role="alert">{state.errors.email}</p>}
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input ref={passwordInput} id="auth-password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required readOnly={state.busy}
              value={password} onChange={event => setPassword(event.target.value)} aria-invalid={Boolean(state.errors.password)} aria-describedby={state.errors.password ? 'auth-password-error' : undefined} />
            {state.errors.password && <p id="auth-password-error" className="auth-field-error" role="alert">{state.errors.password}</p>}
          </div>
          {state.error && <p ref={feedback} tabIndex={-1} className="auth-error" role="alert">{state.error}</p>}
          <button className="auth-submit" type="submit" disabled={state.busy}>{state.busy ? (signup ? 'Creating account…' : 'Logging in…') : title}</button>
          <span className="auth-announcement" role="status">{state.busy ? (signup ? 'Creating account. Please wait.' : 'Logging in. Please wait.') : ''}</span>
        </form>
        <p className="auth-alternative">{signup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New to PinSphere? <Link to="/signup">Create account</Link></>}</p>
      </>}
    </main>
  </div>
}
