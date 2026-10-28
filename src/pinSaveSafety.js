// A database rejection is different from an interrupted response: the latter
// may arrive after the server has committed the write. Never blindly retry it.
export function isRejectedPinWrite(error) {
  return /^(22|23|28|42|44)[A-Z0-9]{3}$/.test(error?.code || '')
}

export function confirmedPinRollback(pinId, { data, error }) {
  return !error && Array.isArray(data) && data.some(row => row.id === pinId)
}
