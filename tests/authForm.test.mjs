import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuthSubmission, validateAuthFields } from '../src/authForm.js'

const fields = { email: ' person@example.com ', password: '  exact password  ' }
function setup(signup, operation) {
  const states = [], calls = [], redirects = []
  const auth = Object.fromEntries(['signUp', 'signInWithPassword'].map(method => [method, async values => {
    calls.push({ method, values }); return operation(values)
  }]))
  return { states, calls, redirects, controller: createAuthSubmission({ auth, signup,
    onState: state => states.push(state), onAuthenticated: () => redirects.push('/map') }) }
}
test('auth validation requires both fields without guessing server password policy', () => {
  assert.deepEqual(validateAuthFields(' ', ''), { email: 'Enter your email address.', password: 'Enter your password.' })
  assert.ok(validateAuthFields('not-an-email', 'pass').email)
  assert.ok(validateAuthFields('person@example.com', 'pass', true).email)
  assert.deepEqual(validateAuthFields(' person@example.com ', 'x'), {})
})
test('invalid forms never send authentication requests', async () => {
  const ctx = setup(false, () => { throw new Error('Must not run') })
  await ctx.controller.submit({ email: '', password: '' })
  assert.equal(ctx.calls.length, 0)
  assert.ok(ctx.states.at(-1).errors.email)
})
test('login uses existing operation, preserves password exactly, redirects once, blocks duplicate submits', async () => {
  let resolve
  const ctx = setup(false, () => new Promise(done => { resolve = done }))
  const request = ctx.controller.submit(fields)
  await ctx.controller.submit(fields)
  assert.equal(ctx.calls.length, 1)
  assert.equal(ctx.states.at(-1).busy, true)
  assert.deepEqual(ctx.calls[0], { method: 'signInWithPassword', values: { email: 'person@example.com', password: fields.password } })
  resolve({ data: { session: { access_token: 'test' } }, error: null })
  await request
  await ctx.controller.submit(fields)
  assert.deepEqual(ctx.redirects, ['/map'])
  assert.equal(ctx.calls.length, 1)
})
test('signup without a session presents confirmation without redirect or repeated signup', async () => {
  const ctx = setup(true, () => ({ data: { user: { id: 'test' }, session: null }, error: null }))
  await ctx.controller.submit(fields)
  await ctx.controller.submit(fields)
  assert.equal(ctx.calls[0].method, 'signUp')
  assert.equal(ctx.states.at(-1).confirmation, true)
  assert.equal(ctx.states.at(-1).busy, false)
  assert.equal(ctx.calls.length, 1)
  assert.equal(ctx.redirects.length, 0)
})
test('signup with a session retains the /map redirect', async () => {
  const ctx = setup(true, () => ({ data: { user: {}, session: {} }, error: null }))
  await ctx.controller.submit(fields)
  assert.deepEqual(ctx.redirects, ['/map'])
})
test('server rejection retains supplied fields and allows an explicit retry', async () => {
  const input = Object.freeze({ ...fields })
  const ctx = setup(false, () => ({ error: { message: 'Invalid login credentials' } }))
  await ctx.controller.submit(input)
  assert.equal(ctx.states.at(-1).error, 'Invalid login credentials')
  assert.equal(ctx.states.at(-1).busy, false)
  assert.deepEqual(input, fields)
  await ctx.controller.submit(input)
  assert.equal(ctx.calls.length, 2)
  assert.equal(ctx.redirects.length, 0)
})
test('network errors are safe and missing sessions never count as login success', async () => {
  const ctx = setup(false, () => { throw new Error('sensitive internals') })
  await ctx.controller.submit(fields)
  assert.equal(ctx.states.at(-1).error, 'Could not connect. Check your connection and try again.')
  const missing = setup(false, () => ({ data: { user: {} }, error: null }))
  await missing.controller.submit(fields)
  assert.ok(missing.states.at(-1).error)
  assert.equal(missing.redirects.length, 0)
})
test('leaving the form ignores late auth responses and prevents new submissions', async () => {
  let resolve
  const ctx = setup(true, () => new Promise(done => { resolve = done }))
  const request = ctx.controller.submit(fields)
  ctx.controller.dispose()
  resolve({ data: { session: {} }, error: null })
  await request
  await ctx.controller.submit(fields)
  assert.equal(ctx.redirects.length, 0)
  assert.equal(ctx.states.length, 1)
  assert.equal(ctx.calls.length, 1)
})
