#!/usr/bin/env node
// Manual release helper for axe-ai-sdk monorepo.
//
// Usage:
//   node scripts/release.mjs 0.0.6            # bump to explicit version
//   node scripts/release.mjs patch            # semver bump: patch|minor|major
//   node scripts/release.mjs patch --dry      # no publish, no push
//   node scripts/release.mjs patch --yes      # skip confirmation prompt
//
// Flow: bump 3 package.json → build → dry-run publish → confirm → publish →
// commit → tag → push.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const PKG_FILES = [
  'package.json',
  'packages/core/package.json',
  'packages/react/package.json',
]

const args = process.argv.slice(2)
const bumpArg = args.find((a) => !a.startsWith('--'))
const DRY = args.includes('--dry')
const YES = args.includes('--yes')

if (!bumpArg) {
  console.error(
    'Usage: node scripts/release.mjs <version|patch|minor|major> [--dry] [--yes]'
  )
  process.exit(1)
}

const sh = (cmd, opts = {}) => {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}
const shCapture = (cmd) =>
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()

function readPkg(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
function writePkg(path, pkg) {
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
}

function bump(current, kind) {
  const parts = current.split('.').map(Number)
  if (kind === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`
  if (kind === 'minor') return `${parts[0]}.${parts[1] + 1}.0`
  if (kind === 'major') return `${parts[0] + 1}.0.0`
  return null
}

const root = readPkg('package.json')
const current = root.version
const next =
  bump(current, bumpArg) ??
  (/^\d+\.\d+\.\d+(-\S+)?$/.test(bumpArg) ? bumpArg : null)

if (!next) {
  console.error(
    `Invalid bump: "${bumpArg}". Use patch|minor|major or explicit X.Y.Z.`
  )
  process.exit(1)
}

const branch = shCapture('git rev-parse --abbrev-ref HEAD')
if (branch !== 'main') {
  console.error(`Aborting: current branch is "${branch}" (expected "main").`)
  process.exit(1)
}

if (shCapture('git tag -l v' + next)) {
  console.error(`Aborting: tag v${next} already exists.`)
  process.exit(1)
}

console.log(`\n=== Release ${current} → ${next} ===`)
console.log(DRY ? '(dry-run — no publish, no push)\n' : '')

// 1) bump all 3
for (const f of PKG_FILES) {
  const p = readPkg(f)
  p.version = next
  writePkg(f, p)
  console.log(`  ${f}: ${next}`)
}

// 2) build
console.log('\n=== Build ===')
sh('pnpm --filter "./packages/*" build')

// 3) dry-run publish (sanity check tarball contents)
console.log('\n=== Publish dry-run ===')
sh('pnpm --filter "./packages/*" publish --dry-run --no-git-checks')

if (DRY) {
  console.log('\n✓ Dry-run complete. Version bumps left in working tree.')
  console.log('  Reset with: git checkout -- package.json packages/*/package.json')
  process.exit(0)
}

// 4) confirm
if (!YES) {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = (
    await rl.question(
      `\nPublish @axe-ai-sdk/{core,react}@${next} to npm? (yes/no) `
    )
  ).trim()
  rl.close()
  if (answer !== 'yes' && answer !== 'y') {
    console.log('Aborted. Version bumps left in working tree.')
    process.exit(0)
  }
}

// 5) publish
console.log('\n=== Publish ===')
sh('pnpm --filter "./packages/*" publish --no-git-checks')

// 6) commit + tag + push — also include CHANGELOG.md if it was modified
//    (e.g. after running `pnpm changelog` before this script).
console.log('\n=== Git ===')
const toAdd = [...PKG_FILES]
try {
  const changelogStatus = shCapture('git status --porcelain CHANGELOG.md')
  if (changelogStatus) toAdd.push('CHANGELOG.md')
} catch {}
sh(`git add ${toAdd.join(' ')}`)
sh(`git commit -m "chore(release): v${next}"`)
sh(`git tag v${next}`)
sh('git push origin main --tags')

console.log(`\n✓ Released v${next}`)
console.log(`  https://www.npmjs.com/package/@axe-ai-sdk/core/v/${next}`)
console.log(`  https://www.npmjs.com/package/@axe-ai-sdk/react/v/${next}`)
