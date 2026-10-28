import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDialogStack, dialogReturnTarget } from '../src/dialogs.js'

test('nested dialogs isolate shortcuts to the topmost dialog and release cleanly', () => {
  const stack = createDialogStack(), parent = {}, confirmation = {}
  assert.equal(stack.active, false)
  const closeParent = stack.add(parent)
  const closeConfirmation = stack.add(confirmation)
  assert.equal(stack.isTop(parent), false)
  assert.equal(stack.isTop(confirmation), true)
  assert.equal(stack.top, confirmation)
  closeConfirmation()
  assert.equal(stack.isTop(parent), true)
  closeConfirmation()
  closeParent()
  assert.equal(stack.active, false)
})

test('unmounting a parent does not unlock a still-open nested dialog', () => {
  const stack = createDialogStack(), parent = {}, child = {}
  const closeParent = stack.add(parent), closeChild = stack.add(child)
  closeParent()
  assert.equal(stack.active, true)
  assert.equal(stack.top, child)
  closeChild()
  assert.equal(stack.active, false)
  assert.equal(stack.top, undefined)
})

test('return focus stays in a surviving modal when a removal deletes its trigger', () => {
  const closeButton = {}, map = {}
  const removed = { isConnected: false }
  const parent = { contains: value => value === closeButton, querySelector: () => closeButton }
  assert.equal(dialogReturnTarget(removed, parent, map), closeButton)
  const background = { isConnected: true, closest: () => null, matches: () => false }
  assert.equal(dialogReturnTarget(background, parent, map), closeButton)
  assert.equal(dialogReturnTarget(background, null, map), background)
  assert.equal(dialogReturnTarget(removed, null, map), map)
})
