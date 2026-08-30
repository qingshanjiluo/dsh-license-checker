# dsh-license-checker

DSH 插件：许可证合规检查。扫描项目依赖许可证、检测兼容性、识别限制性许可证并生成报告。

## 功能特性

- **许可证扫描**：自动扫描 `package.json` 依赖及其实际许可证
- **合规检查**：将依赖分类为允许 / 限制性 / 未知
- **兼容性检测**：检测 Copyleft 与 Permissive 许可证混合使用等冲突
- **报告生成**：支持文本、JSON、Markdown 三种格式
- **限制性识别**：自动识别 GPL、AGPL、SSPL 等限制性许可证

## 安装

```bash
# 在 DSH 项目中安装
npm install dsh-license-checker
```

## 工具

| 工具名 | 描述 |
|--------|------|
| `license_scan` | 扫描项目依赖的许可证 |
| `license_check` | 检查许可证合规性 |
| `license_report` | 生成许可证报告 |
| `license_compat` | 检测许可证兼容性 |

## 命令

```
/license check    — 执行合规检查（默认）
/license scan     — 扫描依赖许可证
/license report   — 生成报告
/license compat   — 检测兼容性
```

## 配置

```yaml
dsh-license-checker:
  enabled: true                    # 是否启用
  allowed:                         # 允许的许可证
    - MIT
    - Apache-2.0
    - BSD-2-Clause
    - BSD-3-Clause
    - ISC
  restricted:                      # 限制性许可证
    - GPL-2.0
    - GPL-3.0
    - AGPL-3.0
    - SSPL-1.0
  outputFormat: text               # 输出格式：text | json | markdown
```

## License

MIT
