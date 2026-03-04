#!/usr/bin/env bun
/**
 * Extract HTML and CSS from Safari .webarchive files.
 * Usage: bun scripts/extract-webarchive.ts <path-to-webarchive> [--out <dir>]
 *
 * Uses XML plist format (handles binary data as base64).
 * Outputs JSON to stdout, or writes files to --out directory.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'

const execFileAsync = promisify(execFile)

async function extractWebArchive(archivePath: string) {
  // Convert binary plist to XML (handles binary data as base64 <data> tags)
  const { stdout } = await execFileAsync('plutil', [
    '-convert',
    'xml1',
    '-o',
    '-',
    archivePath,
  ], { maxBuffer: 100 * 1024 * 1024 }) // 100MB buffer for large archives

  // Parse WebMainResource data (base64-encoded HTML)
  const mainDataMatch = stdout.match(
    /<key>WebMainResource<\/key>\s*<dict>\s*<key>WebResourceData<\/key>\s*<data>\s*([\s\S]*?)\s*<\/data>/,
  )
  if (!mainDataMatch) {
    throw new Error('Could not find WebMainResource in webarchive')
  }

  const base64Html = mainDataMatch[1].replace(/\s/g, '')
  const html = Buffer.from(base64Html, 'base64').toString('utf-8')

  // Extract CSS subresources
  const cssParts: string[] = []
  const subResourceRegex =
    /<key>WebResourceData<\/key>\s*<data>\s*([\s\S]*?)\s*<\/data>\s*<key>WebResourceMIMEType<\/key>\s*<string>([\s\S]*?)<\/string>(?:\s*<key>WebResourceURL<\/key>\s*<string>([\s\S]*?)<\/string>)?/g
  let subMatch
  while ((subMatch = subResourceRegex.exec(stdout)) !== null) {
    const mimeType = subMatch[2]
    const url = subMatch[3] || 'inline'
    if (mimeType.includes('css')) {
      const cssBase64 = subMatch[1].replace(/\s/g, '')
      const cssContent = Buffer.from(cssBase64, 'base64').toString('utf-8')
      cssParts.push(`/* Source: ${url} */\n${cssContent}`)
    }
  }

  // Also try alternative key ordering (URL before MIME)
  const altSubResourceRegex =
    /<key>WebResourceData<\/key>\s*<data>\s*([\s\S]*?)\s*<\/data>[\s\S]*?<key>WebResourceURL<\/key>\s*<string>([\s\S]*?)<\/string>/g
  let altMatch
  while ((altMatch = altSubResourceRegex.exec(stdout)) !== null) {
    const url = altMatch[2]
    if (url.endsWith('.css') && !cssParts.some((p) => p.includes(url))) {
      const cssBase64 = altMatch[1].replace(/\s/g, '')
      const cssContent = Buffer.from(cssBase64, 'base64').toString('utf-8')
      cssParts.push(`/* Source: ${url} */\n${cssContent}`)
    }
  }

  // Extract inline <style> from HTML
  const inlineStyles: string[] = []
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let styleMatch
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    inlineStyles.push(styleMatch[1])
  }

  const css = [...inlineStyles, ...cssParts].join('\n\n')

  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled'

  return { title, html, css, htmlSize: html.length, cssSize: css.length }
}

// CLI
const archivePath = process.argv[2]
if (!archivePath) {
  console.error(
    'Usage: bun scripts/extract-webarchive.ts <path-to-webarchive> [--out <dir>]',
  )
  process.exit(1)
}

const outIdx = process.argv.indexOf('--out')
const outDir = outIdx >= 0 ? process.argv[outIdx + 1] : null

const { title, html, css, htmlSize, cssSize } = await extractWebArchive(archivePath)

if (outDir) {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(`${outDir}/index.html`, html)
  writeFileSync(`${outDir}/styles.css`, css)
  writeFileSync(
    `${outDir}/metadata.json`,
    JSON.stringify({ title }, null, 2),
  )
  console.log(
    `Extracted "${title}" to ${outDir}/ (HTML: ${htmlSize}, CSS: ${cssSize})`,
  )
} else {
  process.stdout.write(JSON.stringify({ title, html, css }, null, 2))
}
