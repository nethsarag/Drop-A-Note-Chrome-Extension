import { generateKeyPairSync, createHash } from 'crypto'
import { writeFileSync } from 'fs'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const der = publicKey.export({ type: 'spki', format: 'der' })
const alphabet = 'abcdefghijklmnop'
const id = [...createHash('sha256').update(der).digest().subarray(0, 16)]
  .map((b) => alphabet[b >> 4] + alphabet[b & 15])
  .join('')

writeFileSync('key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }))
console.log('PUBLIC KEY (goes in manifest "key"):\n' + der.toString('base64'))
console.log('\nEXTENSION ID (goes in Google Cloud OAuth client):\n' + id)