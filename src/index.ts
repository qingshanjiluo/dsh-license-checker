/**
 * dsh-license-checker — 许可证合规检查
 *
 * 功能：
 * 1. 扫描项目依赖许可证
 * 2. 检测许可证兼容性
 * 3. 识别限制性许可证（GPL/AGPL/SSPL）
 * 4. 生成许可证报告
 * 5. 许可证冲突检测
 *
 * 工具：license_scan, license_check, license_report, license_compat
 * 命令：/license
 * 配置：enabled, allowed, restricted, outputFormat
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';

export const name = 'dsh-license-checker';
export const inject = ['settings', 'tools', 'commands'];

const configSchema = z.object({
  enabled: z.boolean().default(true),
  allowed: z.array(z.string()).default(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']),
  restricted: z.array(z.string()).default(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'SSPL-1.0']),
  outputFormat: z.enum(['text', 'json', 'markdown']).default('text'),
});

type Config = z.infer<typeof configSchema>;

interface LicenseInfo {
  name: string;
  version: string;
  license: string;
  repository?: string;
  publisher?: string;
}

const LICENSE_PATTERNS: Record<string, string> = {
  'MIT': 'MIT',
  'Apache-2.0': 'Apache-2.0',
  'BSD-2-Clause': 'BSD-2-Clause',
  'BSD-3-Clause': 'BSD-3-Clause',
  'ISC': 'ISC',
  'GPL-2.0': 'GPL-2.0',
  'GPL-3.0': 'GPL-3.0',
  'AGPL-3.0': 'AGPL-3.0',
  'LGPL-2.1': 'LGPL-2.1',
  'LGPL-3.0': 'LGPL-3.0',
  'MPL-2.0': 'MPL-2.0',
  'Unlicense': 'Unlicense',
  'CC0-1.0': 'CC0-1.0',
};

function scanPackageJsonDeps(pkgPath: string): LicenseInfo[] {
  if (!existsSync(pkgPath)) return [];
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).map(([name, version]) => ({
    name,
    version: String(version),
    license: 'unknown',
  }));
}

function detectLicenseInNodeModules(deps: LicenseInfo[]): LicenseInfo[] {
  for (const dep of deps) {
    const pkgPath = join('node_modules', dep.name, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        dep.license = typeof pkg.license === 'object' ? pkg.license.type : (pkg.license || 'unknown');
        dep.repository = pkg.repository?.url || '';
        dep.publisher = pkg.author || '';
      } catch {}
    }
  }
  return deps;
}

function classifyLicense(license: string, config: Config): 'allowed' | 'restricted' | 'unknown' {
  if (config.allowed.some(a => license.includes(a))) return 'allowed';
  if (config.restricted.some(r => license.includes(r))) return 'restricted';
  return 'unknown';
}

function checkCompatibility(licenses: string[], config: Config): { compatible: boolean; conflicts: string[] } {
  const conflicts: string[] = [];
  const hasCopyleft = licenses.some(l => l.includes('GPL') || l.includes('AGPL'));
  const hasPermissive = licenses.some(l => config.allowed.some(a => l.includes(a)));

  if (hasCopyleft && hasPermissive) {
    conflicts.push('Copyleft 与 Permissive 许可证混合使用');
  }
  return { compatible: conflicts.length === 0, conflicts };
}

export function apply(ctx: any, config: Config) {
  if (!config.enabled) return;

  ctx.tools.register({
    name: 'license_scan',
    description: '扫描项目依赖的许可证',
    parameters: z.object({
      path: z.string().default('.'),
      includeDev: z.boolean().default(true),
    }),
    async execute({ path: projectPath, includeDev }: any) {
      const pkgPath = join(resolve(projectPath), 'package.json');
      let deps = scanPackageJsonDeps(pkgPath);
      if (!includeDev) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const devDeps = Object.keys(pkg.devDependencies || {});
        deps = deps.filter(d => !devDeps.includes(d.name));
      }
      deps = detectLicenseInNodeModules(deps);
      return { total: deps.length, deps };
    },
  });

  ctx.tools.register({
    name: 'license_check',
    description: '检查许可证合规性',
    parameters: z.object({
      path: z.string().default('.'),
    }),
    async execute({ path: projectPath }: any) {
      const pkgPath = join(resolve(projectPath), 'package.json');
      const deps = detectLicenseInNodeModules(scanPackageJsonDeps(pkgPath));
      const results = deps.map(d => ({
        ...d,
        status: classifyLicense(d.license, config),
      }));

      const restricted = results.filter(r => r.status === 'restricted');
      const unknown = results.filter(r => r.status === 'unknown');
      const allowed = results.filter(r => r.status === 'allowed');

      return {
        total: deps.length,
        allowed: allowed.length,
        restricted: restricted.length,
        unknown: unknown.length,
        issues: [...restricted.map(r => `⚠️ ${r.name}: ${r.license}`), ...unknown.map(r => `❓ ${r.name}: ${r.license}`)],
      };
    },
  });

  ctx.tools.register({
    name: 'license_report',
    description: '生成许可证报告',
    parameters: z.object({
      format: z.enum(['text', 'json', 'markdown']).optional(),
    }),
    async execute({ format }: any) {
      const pkgPath = 'package.json';
      const deps = detectLicenseInNodeModules(scanPackageJsonDeps(pkgPath));
      const fmt = format || config.outputFormat;

      const summary: Record<string, number> = {};
      for (const dep of deps) {
        summary[dep.license] = (summary[dep.license] || 0) + 1;
      }

      if (fmt === 'json') return { summary, deps };
      if (fmt === 'markdown') {
        const lines = ['# 许可证报告\n', `总计: ${deps.length} 个依赖\n`, '| 许可证 | 数量 |', '|--------|------|'];
        for (const [license, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
          lines.push(`| ${license} | ${count} |`);
        }
        return { report: lines.join('\n') };
      }
      return { summary, total: deps.length };
    },
  });

  ctx.tools.register({
    name: 'license_compat',
    description: '检测许可证兼容性',
    parameters: z.object({
      licenses: z.array(z.string()).optional().describe('指定许可证列表'),
    }),
    async execute({ licenses }: any) {
      let licenseList = licenses;
      if (!licenseList) {
        const pkgPath = 'package.json';
        const deps = detectLicenseInNodeModules(scanPackageJsonDeps(pkgPath));
        licenseList = [...new Set(deps.map(d => d.license))];
      }
      const result = checkCompatibility(licenseList, config);
      return { licenses: licenseList, ...result };
    },
  });

  ctx.commands.register({
    name: 'license',
    description: '许可证合规检查',
    async execute(args: string) {
      const action = args.trim() || 'check';
      const result = await ctx.tools.execute(`license_${action}`, {});
      return { content: JSON.stringify(result, null, 2) };
    },
  });

  ctx.settings.register({
    title: 'license-checker',
    description: '许可证合规检查',
    config: configSchema,
  });
}
