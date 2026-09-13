/**
 * Pure SPDX license-policy tools for DeepSeek Harness.
 *
 * Three model-facing tools, all deterministic and network-free:
 *  - `license_check`   check a dependency list against an allow/deny policy.
 *  - `license_classify` map a single SPDX id to a license family.
 *  - `license_compat`   flag copyleft-vs-permissive/proprietary conflicts.
 *
 * There is no filesystem, subprocess, or network access: the model supplies the
 * dependency data and the plugin reasons over an embedded SPDX table.
 * @module @qingshanjiluo/dsh-license-checker
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-license-checker'
export const inject = ['tools']

/** Deployment policy defaults consumed by {@link apply}. */
export interface Config {
  /** SPDX ids permitted when a caller passes an empty allow list. */
  allow: string[]
  /** SPDX ids always rejected when a caller passes an empty deny list. */
  deny: string[]
}

/** Schemastery configuration for the license checker. */
export const Config: z<Config> = z.object({
  allow: z.array(z.string()).default(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']),
  deny: z.array(z.string()).default(['AGPL-3.0-only', 'AGPL-3.0', 'SSPL-1.0']),
})

/** Recognised license families produced by the classifier. */
export type LicenseFamily = 'permissive' | 'copyleft' | 'weak-copyleft' | 'proprietary' | 'unknown'

/** Embedded SPDX-id -> family table (ids stored upper-cased for lookup). */
const SPDX_FAMILY: Record<string, LicenseFamily> = {
  'MIT': 'permissive',
  'MIT-0': 'permissive',
  'APACHE-2.0': 'permissive',
  'BSD-2-CLAUSE': 'permissive',
  'BSD-3-CLAUSE': 'permissive',
  '0BSD': 'permissive',
  'ISC': 'permissive',
  'UNLICENSE': 'permissive',
  'CC0-1.0': 'permissive',
  'ZLIB': 'permissive',
  'POSTGRESQL': 'permissive',
  'PYTHON-2.0': 'permissive',
  'BSL-1.0': 'permissive',
  'ARTISTIC-2.0': 'permissive',
  'WTFPL': 'permissive',
  'GPL-2.0': 'copyleft',
  'GPL-2.0-ONLY': 'copyleft',
  'GPL-2.0-OR-LATER': 'copyleft',
  'GPL-3.0': 'copyleft',
  'GPL-3.0-ONLY': 'copyleft',
  'GPL-3.0-OR-LATER': 'copyleft',
  'AGPL-3.0': 'copyleft',
  'AGPL-3.0-ONLY': 'copyleft',
  'AGPL-3.0-OR-LATER': 'copyleft',
  'AGPL-1.0': 'copyleft',
  'GFDL-1.3-ONLY': 'copyleft',
  'GFDL-1.3-OR-LATER': 'copyleft',
  'SSPL-1.0': 'copyleft',
  'QPL-1.0-INLAMP-2020': 'copyleft',
  'LGPL-2.0': 'weak-copyleft',
  'LGPL-2.1': 'weak-copyleft',
  'LGPL-2.1-ONLY': 'weak-copyleft',
  'LGPL-2.1-OR-LATER': 'weak-copyleft',
  'LGPL-3.0': 'weak-copyleft',
  'LGPL-3.0-ONLY': 'weak-copyleft',
  'LGPL-3.0-OR-LATER': 'weak-copyleft',
  'MPL-2.0': 'weak-copyleft',
  'MPL-1.1': 'weak-copyleft',
  'CPL-1.0': 'weak-copyleft',
  'EPL-1.0': 'weak-copyleft',
  'EPL-2.0': 'weak-copyleft',
  'CECILL-B': 'weak-copyleft',
  'BUSL-1.1': 'proprietary',
  'LICENSEREF-PROPRIETARY': 'proprietary',
  'PROPRIETARY': 'proprietary',
}

const GPL_IDS = new Set(['GPL-2.0', 'GPL-2.0-ONLY', 'GPL-2.0-OR-LATER', 'GPL-3.0', 'GPL-3.0-ONLY', 'GPL-3.0-OR-LATER'])
const AGPL_IDS = new Set(['AGPL-3.0', 'AGPL-3.0-ONLY', 'AGPL-3.0-OR-LATER', 'AGPL-1.0'])

/**
 * Normalise a license id for deterministic table lookups: trim, collapse
 * internal whitespace, upper-case.
 * @param licenseId - raw SPDX identifier.
 */
function normalize(licenseId: string): string {
  return licenseId.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Classify a single SPDX id into a family plus a commercial-use verdict.
 * Commercial use is allowed for every recognised open family; proprietary and
 * unknown ids are conservatively flagged as not allowed.
 * @param licenseId - raw SPDX identifier.
 */
function classifyOne(licenseId: string): { id: string; family: LicenseFamily; allowedCommercial: boolean } {
  const id = normalize(licenseId)
  const family = SPDX_FAMILY[id] ?? 'unknown'
  const allowedCommercial = family !== 'proprietary' && family !== 'unknown'
  return { id: licenseId.trim(), family, allowedCommercial }
}

/**
 * Check a dependency list against allow/deny SPDX ids.
 * @param deps - dependency name/license pairs.
 * @param allow - permissive allow-list of SPDX ids (empty means "no allow gate").
 * @param deny - hard reject-list of SPDX ids.
 * @returns ok flag and one violation per offending dependency.
 */
function checkPolicy(
  deps: readonly { name: string; license: string }[],
  allow: readonly string[],
  deny: readonly string[],
): { ok: boolean; violations: { name: string; license: string; reason: string }[] } {
  const allowSet = new Set(allow.map(normalize))
  const denySet = new Set(deny.map(normalize))
  const violations: { name: string; license: string; reason: string }[] = []

  for (const dep of deps) {
    const id = normalize(dep.license)
    if (id.length === 0) {
      violations.push({ name: dep.name, license: dep.license, reason: 'missing license id' })
      continue
    }
    if (denySet.has(id)) {
      violations.push({ name: dep.name, license: dep.license, reason: 'license is on the deny list' })
      continue
    }
    if (allowSet.size > 0 && !allowSet.has(id)) {
      violations.push({ name: dep.name, license: dep.license, reason: 'license is not on the allow list' })
      continue
    }
    if (SPDX_FAMILY[id] === undefined) {
      violations.push({ name: dep.name, license: dep.license, reason: 'license is not a recognized SPDX id' })
    }
  }
  return { ok: violations.length === 0, violations }
}

/**
 * Detect copyleft-vs-permissive/proprietary incompatibilities.
 * Heuristics (deterministic, documented in README):
 *  - an unknown SPDX id is always flagged for manual review;
 *  - a proprietary id combined with any copyleft id is a conflict;
 *  - GPL-family and AGPL-family coexisting is a conflict.
 * @param componentLicenses - SPDX ids of the components being combined.
 */
function checkCompat(componentLicenses: readonly string[]): { ok: boolean; conflicts: string[] } {
  const ids = componentLicenses.map(normalize).filter(id => id.length > 0)
  const families = new Map<string, LicenseFamily>()
  for (const id of ids) families.set(id, SPDX_FAMILY[id] ?? 'unknown')

  const conflicts: string[] = []
  const has = (fam: LicenseFamily) => [...families.values()].includes(fam)
  const hasCopyleft = has('copyleft') || has('weak-copyleft')

  for (const [id, fam] of families) {
    if (fam === 'unknown') conflicts.push(`${id}: unrecognized SPDX id, needs manual review`)
  }
  if (has('proprietary') && hasCopyleft) {
    conflicts.push('proprietary component combined with a copyleft license')
  }
  const anyGpl = ids.some(id => GPL_IDS.has(id))
  const anyAglp = ids.some(id => AGPL_IDS.has(id))
  if (anyGpl && anyAglp) {
    conflicts.push('GPL-family and AGPL-family licenses are not compatible')
  }
  return { ok: conflicts.length === 0, conflicts }
}

/**
 * Register the license tools on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment's allow/deny policy defaults.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'license_check',
    description:
      'Check a dependency list against a license policy. Pass deps as ' +
      '[{name, license}] (license = SPDX id) plus allow/deny arrays of SPDX ids; ' +
      'empty allow/deny fall back to the configured policy. Returns ok and one ' +
      'violation entry per offending dependency.',
    parameters: {
      deps: {
        type: 'array',
        required: true,
        description: 'Dependencies to check.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true, description: 'Package name.' },
            license: { type: 'string', required: true, description: 'SPDX license id, e.g. MIT.' },
          },
        },
      },
      allow: {
        type: 'array',
        required: true,
        description: 'Allowed SPDX ids. Empty means use the configured allow list.',
        items: { type: 'string' },
      },
      deny: {
        type: 'array',
        required: true,
        description: 'Denied SPDX ids. Empty means use the configured deny list.',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, description: 'True when no violations were found.' },
          violations: {
            type: 'array',
            required: true,
            description: 'One entry per dependency that failed the policy.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true, description: 'Package name.' },
                license: { type: 'string', required: true, description: 'License id supplied.' },
                reason: { type: 'string', required: true, description: 'Why it failed.' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? 'License policy satisfied: no violations.'
          : `${value.violations.length} violation(s):\n- ${value.violations.map(v => `${v.name} (${v.license}): ${v.reason}`).join('\n- ')}`,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const allow = args.allow.length > 0 ? args.allow : config.allow
      const deny = args.deny.length > 0 ? args.deny : config.deny
      return Promise.resolve(checkPolicy(args.deps, allow, deny))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'license_classify',
    description:
      'Classify one SPDX license id into a family: permissive, copyleft, ' +
      'weak-copyleft, proprietary, or unknown; plus a commercial-use verdict. ' +
      'Pure table lookup over an embedded SPDX map — no network.',
    parameters: {
      licenseId: { type: 'string', required: true, description: 'SPDX license id, e.g. Apache-2.0.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'The trimmed license id supplied.' },
          family: {
            type: 'string',
            required: true,
            description: 'License family: permissive | copyleft | weak-copyleft | proprietary | unknown.',
          },
          allowedCommercial: { type: 'boolean', required: true, description: 'Whether commercial use is presumed allowed.' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.id}: ${value.family} (commercial use ${value.allowedCommercial ? 'allowed' : 'needs review'})`,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      return Promise.resolve(classifyOne(args.licenseId))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'license_compat',
    description:
      'Check a set of component SPDX ids for licensing incompatibilities using ' +
      'simple copyleft-vs-permissive heuristics (unknown id, proprietary+copyleft ' +
      'mix, and GPL+AGPL mix). Returns ok and a list of conflict strings.',
    parameters: {
      componentLicenses: {
        type: 'array',
        required: true,
        description: 'SPDX ids of the components being combined.',
        items: { type: 'string' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, description: 'True when no conflicts were detected.' },
          conflicts: {
            type: 'array',
            required: true,
            description: 'Human-readable conflict advisories; empty when ok.',
            items: { type: 'string' },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? 'No license compatibility conflicts.'
          : `${value.conflicts.length} conflict(s):\n- ${value.conflicts.join('\n- ')}`,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      return Promise.resolve(checkCompat(args.componentLicenses))
    },
  }))
}
