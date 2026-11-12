// Build index.json: this repository as a DeepSeek Harness plugin market index
// (format 1), pinned to the commit you run it on. Run `npm run index` after a
// release, and commit the result.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const git = args => execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim()

const url = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
const commit = git(['rev-parse', 'HEAD'])
const published = Number(git(['log', '-1', '--format=%ct']))

const index = {
  format: 1,
  title: { en: 'Ponytail', zh: 'Ponytail' },
  description: {
    en: 'Ponytail for DeepSeek Harness: a per-session lazy senior dev mode.',
    zh: 'DeepSeek Harness 上的 Ponytail：按会话开启的懒惰资深开发模式。',
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Ponytail', zh: 'Ponytail' },
      description: {
        en: pkg.description,
        zh: '按会话开启的懒惰资深开发模式：最小改动、提示词上方的 band、每个任务一行看板。',
      },
      icon: 'icon.svg',
      author: pkg.author,
      homepage: pkg.homepage,
      repository: { url },
      keywords: pkg.keywords,
      'dist-tags': { latest: pkg.version },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: published,
          source: { type: 'git', url, commit },
          engines: { dsh: '*' },
        },
      ],
    },
  ],
}

writeFileSync(new URL('../index.json', import.meta.url), `${JSON.stringify(index, null, 2)}\n`)
console.log(`index.json: ${pkg.name}@${pkg.version} at ${commit.slice(0, 7)}`)
