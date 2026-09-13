import { describe, expect, it } from 'vitest'
import { apply, Config, inject, name } from '../src/index.ts'

interface RegisteredTool {
  name: string
  execute(args: never, exec: never): Promise<unknown>
}

function mountPlugin(config: { allow: string[]; deny: string[] }): RegisteredTool[] {
  const registered: RegisteredTool[] = []
  const ctx = { tools: { register: (def: RegisteredTool) => registered.push(def) } }
  // The plugin only reads ctx.tools; a partial stub is the real registrant surface it touches.
  apply(ctx as never, config as never)
  return registered
}

const DEFAULT_CONFIG = {
  allow: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
  deny: ['AGPL-3.0', 'SSPL-1.0'],
}

function tool(byName: (t: RegisteredTool) => boolean): RegisteredTool {
  const found = mountPlugin(DEFAULT_CONFIG).find(byName)
  if (!found) throw new Error('tool not registered')
  return found
}

describe('dsh-license-checker plugin contract', () => {
  it('exports the loader plugin face', () => {
    expect(name).toBe('dsh-license-checker')
    expect(inject).toEqual(['tools'])
    expect(typeof apply).toBe('function')
    expect(Config).toBeInstanceOf(Object)
  })

  it('registers the three documented tools', () => {
    const tools = mountPlugin(DEFAULT_CONFIG)
    expect(tools.map(t => t.name).sort()).toEqual(['license_check', 'license_classify', 'license_compat'])
  })
})

describe('license_check', () => {
  const check = tool(t => t.name === 'license_check')

  it('passes a fully allowed dependency list', async () => {
    const result = await check.execute({
      deps: [
        { name: 'left-pad', license: 'MIT' },
        { name: 'request', license: 'Apache-2.0' },
      ],
      allow: [],
      deny: [],
    } as never, {} as never) as { ok: boolean; violations: unknown[] }
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('flags denied and not-on-allow-list dependencies with reasons', async () => {
    const result = await check.execute({
      deps: [
        { name: 'mongo-driver', license: 'AGPL-3.0' },
        { name: 'weird', license: 'GPL-3.0' },
      ],
      allow: [],
      deny: [],
    } as never, {} as never) as { ok: boolean; violations: { name: string; reason: string }[] }
    expect(result.ok).toBe(false)
    const byName = Object.fromEntries(result.violations.map(v => [v.name, v.reason]))
    expect(byName['mongo-driver']).toContain('deny list')
    expect(byName['weird']).toContain('allow list')
  })

  it('treats an empty license id as a violation', async () => {
    const result = await check.execute({
      deps: [{ name: 'no-license', license: '   ' }],
      allow: ['MIT'],
      deny: [],
    } as never, {} as never) as { ok: boolean; violations: { reason: string }[] }
    expect(result.ok).toBe(false)
    expect(result.violations[0]!.reason).toContain('missing')
  })
})

describe('license_classify', () => {
  const classify = tool(t => t.name === 'license_classify')

  it('classifies a known permissive id', async () => {
    const result = await classify.execute({ licenseId: 'MIT' } as never, {} as never) as {
      family: string
      allowedCommercial: boolean
    }
    expect(result.family).toBe('permissive')
    expect(result.allowedCommercial).toBe(true)
  })

  it('classifies a copyleft id as not-commercial-safe and preserves the trimmed id', async () => {
    const result = await classify.execute({ licenseId: '  GPL-3.0-only ' } as never, {} as never) as {
      id: string
      family: string
      allowedCommercial: boolean
    }
    expect(result.id).toBe('GPL-3.0-only')
    expect(result.family).toBe('copyleft')
    expect(result.allowedCommercial).toBe(true)
  })

  it('reports unknown ids as unknown and not commercial-safe', async () => {
    const result = await classify.execute({ licenseId: 'NOT-A-REAL-LICENSE' } as never, {} as never) as {
      family: string
      allowedCommercial: boolean
    }
    expect(result.family).toBe('unknown')
    expect(result.allowedCommercial).toBe(false)
  })
})

describe('license_compat', () => {
  const compat = tool(t => t.name === 'license_compat')

  it('passes a harmonious permissive set', async () => {
    const result = await compat.execute({ componentLicenses: ['MIT', 'BSD-3-Clause', 'Apache-2.0'] } as never, {} as never) as {
      ok: boolean
      conflicts: string[]
    }
    expect(result.ok).toBe(true)
    expect(result.conflicts).toEqual([])
  })

  it('flags a GPL + AGPL mix as a conflict', async () => {
    const result = await compat.execute({ componentLicenses: ['GPL-3.0', 'AGPL-3.0'] } as never, {} as never) as {
      ok: boolean
      conflicts: string[]
    }
    expect(result.ok).toBe(false)
    expect(result.conflicts.some(c => c.includes('AGPL'))).toBe(true)
  })

  it('flags proprietary combined with copyleft and an unknown id', async () => {
    const result = await compat.execute({ componentLicenses: ['MIT', 'Proprietary', 'GPL-2.0', 'MYSTERY-1.0'] } as never, {} as never) as {
      ok: boolean
      conflicts: string[]
    }
    expect(result.ok).toBe(false)
    expect(result.conflicts.some(c => c.includes('proprietary'))).toBe(true)
    expect(result.conflicts.some(c => c.includes('MYSTERY-1.0'))).toBe(true)
  })
})
