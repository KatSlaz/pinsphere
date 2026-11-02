// Form state only: Supabase remains responsible for credentials and password policy.
export function validateAuthFields(email, password, emailMismatch = false) {
  const errors = {}
  if (!email.trim()) errors.email = 'Enter your email address.'
  else if (emailMismatch || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}

export function createAuthSubmission({ auth, signup, onState, onAuthenticated }) {
  let pending = false
  let disposed = false
  let confirmed = false
  return {
    async submit({ email, password, emailMismatch = false }) {
      if (disposed || pending || confirmed) return
      const errors = validateAuthFields(email, password, emailMismatch)
      if (Object.keys(errors).length) { onState({ busy: false, errors, error: '', confirmation: false }); return }
      pending = true
      onState({ busy: true, errors: {}, error: '', confirmation: false })
      try {
        const { data, error } = signup
          ? await auth.signUp({ email: email.trim(), password })
          : await auth.signInWithPassword({ email: email.trim(), password })
        if (disposed) return
        if (error) {
          onState({ busy: false, errors: {}, error: error.message || 'Could not continue. Please try again.', confirmation: false })
        } else if (data?.session) {
          // Keep the form locked during the existing /map redirect.
          confirmed = true
          onAuthenticated()
        } else if (signup && data?.user) {
          confirmed = true
          onState({ busy: false, errors: {}, error: '', confirmation: true })
        } else {
          onState({ busy: false, errors: {}, error: 'Sign-in could not be confirmed. Please try logging in.', confirmation: false })
        }
      } catch {
        if (!disposed) onState({ busy: false, errors: {}, error: 'Could not connect. Check your connection and try again.', confirmation: false })
      } finally {
        pending = false
      }
    },
    dispose() { disposed = true },
  }
}
