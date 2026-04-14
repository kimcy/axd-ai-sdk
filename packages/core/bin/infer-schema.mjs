#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { inferSchemaFromRaw } from '../dist/index.js'

const args = process.argv.slice(2)

if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write(
    [
      'Usage:',
      '  axe-infer-schema [file]           # read from file',
      '  axe-infer-schema < dump.txt       # read from stdin',
      '  curl -N ... | axe-infer-schema    # pipe SSE stream',
      '',
      'Outputs a best-guess sse-schema.json to stdout.',
      '',
    ].join('\n')
  )
  process.exit(0)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const raw = args[0]
  ? readFileSync(args[0], 'utf8')
  : await readStdin()

if (!raw.trim()) {
  process.stderr.write('error: no input received\n')
  process.exit(1)
}

const schema = inferSchemaFromRaw(raw)
process.stdout.write(JSON.stringify(schema, null, 2) + '\n')
