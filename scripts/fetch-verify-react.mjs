// Fetch the React 18 UMD builds the render check loads, next to the fixture.
// They are MIT, verbatim files served by unpkg, and stay out of git.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '18.3.1'
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'verify', 'fixture')
const files = [
  ['react.development.js', `https://unpkg.com/react@${VERSION}/umd/react.development.js`],
  ['react-dom.development.js', `https://unpkg.com/react-dom@${VERSION}/umd/react-dom.development.js`],
]

await mkdir(target, { recursive: true })
for (const [name, url] of files) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  const body = await response.text()
  if (!body.startsWith('/**')) throw new Error(`${url} did not return a UMD build`)
  await writeFile(join(target, name), body, 'utf8')
  console.log(`${name}: ${body.length} bytes`)
}
