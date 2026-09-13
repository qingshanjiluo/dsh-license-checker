# dsh-license-checker

DeepSeek Harness 插件：纯 SPDX 许可证策略检查。全部为确定性、离线的纯函数工具——不联网、不读写文件系统、不起子进程，依赖数据由模型传入。

## 工具

| 工具名 | 描述 |
|--------|------|
| `license_check` | 输入 `deps:[{name,license}]` 与 `allow/deny` SPDX 列表，输出 `{ok, violations:[{name,license,reason}]}`。`allow/deny` 留空则回退到配置默认值。 |
| `license_classify` | 输入单个 `licenseId`，输出 `{id, family, allowedCommercial}`；`family ∈ permissive / copyleft / weak-copyleft / proprietary / unknown`，基于内置 SPDX→family 映射表。 |
| `license_compat` | 输入 `componentLicenses:[ids]`，用简单的 copyleft-vs-permissive 启发式输出 `{ok, conflicts:[]}`。 |

### `license_compat` 启发式规则

- 未识别的 SPDX id → 记为需人工复核的冲突项；
- 同时出现 `proprietary` 与任一 copyleft/weak-copyleft → 冲突；
- GPL 家族与 AGPL 家族共存 → 冲突。

## 安装

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @qingshanjiluo/dsh-license-checker
```

## 配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `allow` | `string[]` | `MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC` | `license_check` 调用未显式传 `allow` 时使用的允许 SPDX 列表。 |
| `deny` | `string[]` | `AGPL-3.0-only, AGPL-3.0, SSPL-1.0` | `license_check` 调用未显式传 `deny` 时使用的拒绝 SPDX 列表。 |

`cordis.patch.yml` 示例：

```yaml
- insert:
    - id: license-checker
      name: '@qingshanjiluo/dsh-license-checker'
      config:
        allow: [MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC]
        deny: [AGPL-3.0-only, AGPL-3.0, SSPL-1.0]
```

## 开发与自验证

```bash
npm install --no-audit --no-fund
npx tsc --noEmit
npm run build      # 产出 lib/index.js 与 lib/index.d.ts
npx vitest run
node scripts/load-smoke.mjs
```

本插件为纯离线工具，测试完全无网络、无子进程、无监听端口。

## License

MIT
