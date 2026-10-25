import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../../../shared/contracts';
import type { ProviderPreset } from '../../../../shared/providers';
import { request } from '../../api';
import { formatError } from '../../i18n';
import ConnectionEditor from './ConnectionEditor';
import ProviderLibrary from './ProviderLibrary';

export default function Connections({
  providers,
  onSaved,
  onNavigate,
}: {
  providers: Provider[];
  onSaved: () => Promise<void>;
  onNavigate: () => void;
}) {
  const { t } = useTranslation('settings');
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [selected, setSelected] = useState<Provider | ProviderPreset | 'custom' | null>(null);
  const [adding, setAdding] = useState(!providers.length);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>('');
  useEffect(() => {
    void request<ProviderPreset[]>('/provider-presets').then(setPresets).catch(setError);
  }, []);
  const select = (value: typeof selected) => {
    setSelected(value);
    onNavigate();
  };
  if (selected) {
    const existing =
      typeof selected === 'object' && 'hasKey' in selected
        ? providers.find((p) => p.id === selected.id) || selected
        : undefined;
    const preset = existing
      ? presets.find((p) => p.id === existing.presetId)
      : selected !== 'custom'
        ? (selected as ProviderPreset)
        : undefined;
    return (
      <>
        <button className="settings-back" onClick={() => select(null)}>
          <ArrowLeft size={16} />
          {t('connections')}
        </button>
        <ConnectionEditor
          key={existing?.id || preset?.id || 'custom'}
          provider={existing}
          preset={preset}
          onSaved={onSaved}
          onRemoved={() => {
            select(null);
            void onSaved();
          }}
        />
      </>
    );
  }
  return (
    <>
      {!brandId && (
        <>
          <header className="settings-heading">
            <span className="eyebrow">{t('localFirst')}</span>
            <h2>{t('connections')}</h2>
            <p>{t('connectionsIntro')}</p>
          </header>
          <div className="settings-section-title">
            <h3>{t('yourConnections')}</h3>
            <button onClick={() => setAdding(!adding)}>
              <Plus size={15} />
              {t('add')}
            </button>
          </div>
          <div className="connected-list">
            {providers.map((p) => (
              <button className="connected-row" key={p.id} onClick={() => select(p)}>
                <span className="provider-monogram">{p.name[0]}</span>
                <span className="connected-name">
                  <strong>{p.name}</strong>
                  <small>{p.accountLabel || p.model || t('chooseModel')}</small>
                </span>
                <span
                  className={`connection-status ${p.hasKey || p.authMethod === 'none' ? 'ready' : ''}`}
                >
                  {t(p.hasKey || p.authMethod === 'none' ? 'configured' : 'notConnected')}
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {!providers.length && <p className="settings-empty">{t('empty')}</p>}
        </>
      )}
      {(adding || !providers.length) && (
        <ProviderLibrary
          presets={presets}
          brandId={brandId}
          onSelect={select}
          onBrand={(id) => {
            setBrandId(id);
            onNavigate();
          }}
        />
      )}
      <p className="settings-footnote">{t('billingBoundary')}</p>
      {Boolean(error) && (
        <p role="alert" className="settings-error">
          {formatError(error)}
        </p>
      )}
    </>
  );
}
