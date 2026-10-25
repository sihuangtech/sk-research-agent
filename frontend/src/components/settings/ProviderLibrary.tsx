import { ArrowLeft, ChevronRight, KeyRound, Plus, Search, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderPreset } from '../../../../shared/providers';
import { groupProviderPresets, searchProviderGroups } from '../../../../shared/provider-catalog';

export default function ProviderLibrary({
  presets,
  brandId,
  onBrand,
  onSelect,
}: {
  presets: ProviderPreset[];
  brandId: string | null;
  onBrand: (id: string | null) => void;
  onSelect: (preset: ProviderPreset | 'custom') => void;
}) {
  const { t } = useTranslation('settings');
  const [query, setQuery] = useState('');
  const groups = groupProviderPresets(presets);
  const brand = groups.find((g) => g.id === brandId);
  if (brand)
    return (
      <section className="provider-library">
        <button className="settings-back" onClick={() => onBrand(null)}>
          <ArrowLeft size={16} />
          {t('selectProvider')}
        </button>
        <header className="settings-heading">
          <h2>{brand.name}</h2>
          <p>{t('methodHint')}</p>
        </header>
        {(['oauth', 'api_key', 'none'] as const).map((method) => {
          const choices = brand.presets.filter((p) => p.authMethod === method);
          if (!choices.length) return null;
          const Icon = method === 'oauth' ? UserRound : KeyRound;
          return (
            <section className="auth-method-group" key={method}>
              <h3>
                <Icon size={16} />
                {t(method === 'oauth' ? 'oauth' : method === 'none' ? 'local' : 'keySignIn')}
              </h3>
              <div className="auth-choice-list">
                {choices.map((p) => (
                  <button className="auth-choice" key={p.id} onClick={() => onSelect(p)}>
                    <span>
                      <strong>{p.id === 'chatgpt' ? t('continueChatGPT') : p.name}</strong>
                      <small>{t(p.billing)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </section>
    );
  const visible = searchProviderGroups(groups, query);
  return (
    <section className="provider-library">
      <div className="settings-section-title">
        <h3>{t('selectProvider')}</h3>
        <span>{t('catalogHint')}</span>
      </div>
      <label className="provider-search">
        <Search size={16} />
        <input
          aria-label={t('search')}
          placeholder={t('search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="provider-grid">
        {visible.map((g) => (
          <button
            key={g.id}
            className={`provider-tile ${g.id === 'openai' ? 'featured' : ''}`}
            onClick={() => {
              if (g.presets.length === 1) onSelect(g.presets[0]);
              else onBrand(g.id);
            }}
          >
            <span className="provider-monogram">{g.name[0]}</span>
            <strong>{g.name}</strong>
            <small>
              {[
                ...new Set(
                  g.presets.map((p) =>
                    t(
                      p.authMethod === 'oauth'
                        ? 'oauth'
                        : p.authMethod === 'none'
                          ? 'local'
                          : 'apiKey',
                    ),
                  ),
                ),
              ].join(' · ')}
            </small>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
      {!visible.length && <p className="muted">{t('noMatches')}</p>}
      <button className="settings-custom" onClick={() => onSelect('custom')}>
        <Plus size={15} />
        {t('custom')}
      </button>
    </section>
  );
}
