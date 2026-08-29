import { describe, it, expect } from 'vitest'
import { coinDescription, stripHtml, firstUrl } from '../coinDescription'

describe('stripHtml', () => {
  it('removes tags and keeps the text', () => {
    expect(stripHtml('<p>Arbitrum is an <a href="x">L2</a>.</p>')).toBe('Arbitrum is an L2.')
  })

  it('does not fuse words across block boundaries', () => {
    // "<p>a</p><p>b</p>" naively stripped becomes "ab" — two sentences welded
    // into a nonsense word.
    expect(stripHtml('<p>First.</p><p>Second.</p>')).toBe('First. Second.')
    expect(stripHtml('one<br>two')).toBe('one two')
  })

  it('decodes named and numeric entities', () => {
    expect(stripHtml('Tom &amp; Jerry &#39;s &quot;coin&quot;')).toBe('Tom & Jerry \'s "coin"')
    expect(stripHtml('a &mdash; b')).toBe('a — b')
  })

  it('collapses whitespace', () => {
    expect(stripHtml('a\n\n   b\t c')).toBe('a b c')
  })
})

describe('coinDescription', () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} about the project.`).join(' ')

  it('returns null for empty, missing, or markup-only input', () => {
    expect(coinDescription(null)).toBeNull()
    expect(coinDescription(undefined)).toBeNull()
    expect(coinDescription('')).toBeNull()
    expect(coinDescription('<p></p><br>')).toBeNull()
  })

  it('returns null for a fragment too short to be a description', () => {
    // A couple of stray words left after stripping markup is not a description
    // — showing it would look like the panel broke.
    expect(coinDescription('<a href="x">See here</a>')).toBeNull()
  })

  it('passes through a description already within the target', () => {
    const text = 'Arbitrum is an Ethereum layer-2 rollup that batches transactions for lower fees.'
    expect(coinDescription(`<p>${text}</p>`)).toBe(text)
  })

  it('truncates at a sentence boundary, never mid-clause', () => {
    const out = coinDescription(long(40), 200)!
    expect(out.length).toBeLessThanOrEqual(201)
    expect(out.endsWith('.')).toBe(true)
    // The whole point: it did not sever a word.
    expect(out).not.toMatch(/\s\S{1,3}$/)
  })

  it('falls back to a word boundary with an ellipsis when no sentence break fits', () => {
    const noStops = 'word '.repeat(200).trim()
    const out = coinDescription(noStops, 100)!
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toContain('wor…')
  })

  it('never returns raw HTML', () => {
    const out = coinDescription('<p>A project with <b>bold</b> claims and <script>evil()</script> markup, described at some length for the test.</p>')!
    expect(out).not.toContain('<')
    expect(out).not.toContain('script')
  })
})

describe('firstUrl', () => {
  it('skips the empty slots CoinGecko leaves in its homepage array', () => {
    expect(firstUrl(['', '', 'https://arbitrum.io', ''])).toBe('https://arbitrum.io')
  })

  it('accepts a bare string', () => {
    expect(firstUrl('https://example.com')).toBe('https://example.com')
  })

  it('returns null when nothing is a usable URL', () => {
    expect(firstUrl(['', '   ', 'not a url'])).toBeNull()
    expect(firstUrl(undefined)).toBeNull()
    expect(firstUrl([])).toBeNull()
  })

  it('rejects a non-http scheme rather than handing it to an anchor', () => {
    expect(firstUrl(['javascript:alert(1)'])).toBeNull()
  })
})
