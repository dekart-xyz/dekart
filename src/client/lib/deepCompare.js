// deep compare function while ignores the order of keys in objects
export function deepCompare (obj1, obj2) {
  if (obj1 === obj2) return true

  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false
  }

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) return false

  keys1.sort()
  keys2.sort()

  for (let i = 0; i < keys1.length; i++) {
    if (keys1[i] !== keys2[i]) return false
    if (!deepCompare(obj1[keys1[i]], obj2[keys2[i]])) return false
  }

  return true
}
