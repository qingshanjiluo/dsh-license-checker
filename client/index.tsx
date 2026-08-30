import React, { useState, useCallback } from 'react';

interface LicenseCheckerConfig {
  enabled: boolean;
  allowed: string[];
  restricted: string[];
  outputFormat: 'text' | 'json' | 'markdown';
}

const DEFAULT_ALLOWED = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'];
const DEFAULT_RESTRICTED = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'SSPL-1.0'];

function LicenseListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const addItem = () => {
    const trimmed = input.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setInput('');
    }
  };

  const removeItem = (item: string) => {
    onChange(items.filter(i => i !== item));
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {items.map(item => (
          <span
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              background: '#e8e8e8',
              fontSize: 13,
            }}
          >
            {item}
            <button
              onClick={() => removeItem(item)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="输入许可证名称..."
          style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
        />
        <button onClick={addItem} style={{ padding: '4px 12px' }}>
          添加
        </button>
      </div>
    </div>
  );
}

export function LicenseCheckerSettings({
  config,
  onChange,
}: {
  config: LicenseCheckerConfig;
  onChange: (config: LicenseCheckerConfig) => void;
}) {
  const handleToggle = useCallback(() => {
    onChange({ ...config, enabled: !config.enabled });
  }, [config, onChange]);

  const handleFormatChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...config, outputFormat: e.target.value as LicenseCheckerConfig['outputFormat'] });
    },
    [config, onChange],
  );

  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <h3 style={{ margin: '0 0 16px' }}>许可证合规检查</h3>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={handleToggle}
          />
          启用插件
        </label>
      </div>

      <LicenseListEditor
        label="允许的许可证"
        items={config.allowed}
        onChange={allowed => onChange({ ...config, allowed })}
      />

      <LicenseListEditor
        label="限制性许可证"
        items={config.restricted}
        onChange={restricted => onChange({ ...config, restricted })}
      />

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>输出格式</label>
        <select
          value={config.outputFormat}
          onChange={handleFormatChange}
          style={{ width: '100%', padding: '4px 8px' }}
        >
          <option value="text">文本</option>
          <option value="json">JSON</option>
          <option value="markdown">Markdown</option>
        </select>
      </div>
    </div>
  );
}

export default LicenseCheckerSettings;
