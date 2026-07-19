import { describe, it, expect } from 'vitest'
import { decodeEntities, stripCdata, stripTags, cleanFeedText } from '../html'

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('AT&amp;T')).toBe('AT&T')
    expect(decodeEntities('&lt;b&gt;')).toBe('<b>')
    expect(decodeEntities('&quot;quoted&quot;')).toBe('"quoted"')
    expect(decodeEntities('it&apos;s')).toBe("it's")
  })

  it('decodes decimal numeric entities — the reported bug', () => {
    expect(decodeEntities('France&#8217;s regulator')).toBe('France’s regulator')
    expect(decodeEntities('caf&#233;')).toBe('café')
    expect(decodeEntities('&#39;quoted&#39;')).toBe("'quoted'")
    // Zero-padded form the old implementation special-cased
    expect(decodeEntities('&#039;')).toBe("'")
  })

  it('decodes hex numeric entities in either case', () => {
    expect(decodeEntities('France&#x2019;s')).toBe('France’s')
    expect(decodeEntities('France&#X2019;s')).toBe('France’s')
  })

  it('decodes astral-plane code points', () => {
    expect(decodeEntities('&#128512;')).toBe('\u{1F600}')
  })

  it('does not double-decode — the bug in the old chained implementation', () => {
    // Chained .replace() decoded &amp; first, so this collapsed to '<'.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeEntities('&amp;amp;')).toBe('&amp;')
  })

  it('leaves unknown or malformed entities verbatim rather than dropping them', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;')
    expect(decodeEntities('a & b')).toBe('a & b')
    expect(decodeEntities('100&')).toBe('100&')
    expect(decodeEntities('&#;')).toBe('&#;')
  })

  it('rejects out-of-range and surrogate code points', () => {
    expect(decodeEntities('&#0;')).toBe('&#0;')
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;') // 0x110000, one past max
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;')     // lone surrogate
  })

  it('handles multiple entities in one string', () => {
    expect(decodeEntities('A&amp;B &#8212; C&#x2019;s')).toBe('A&B — C’s')
  })
})

describe('stripCdata', () => {
  it('unwraps a whole-string CDATA section', () => {
    expect(stripCdata('<![CDATA[Hello]]>')).toBe('Hello')
  })

  it('unwraps embedded CDATA sections', () => {
    expect(stripCdata('a <![CDATA[b]]> c')).toBe('a b c')
  })

  it('leaves plain text untouched', () => {
    expect(stripCdata('  plain  ')).toBe('plain')
  })
})

describe('stripTags', () => {
  it('removes markup and collapses whitespace', () => {
    expect(stripTags('<p>Hello   <b>world</b></p>')).toBe('Hello world')
  })
})

describe('cleanFeedText', () => {
  it('unwraps, strips, then decodes so escaped markup survives as text', () => {
    expect(cleanFeedText('<![CDATA[<p>France&#8217;s &lt;b&gt; tag</p>]]>')).toBe('France’s <b> tag')
  })
})
