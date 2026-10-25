import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProviderPreset } from '../../../../shared/providers';
import { request } from '../../api';

export default function ConnectionLinks({
  preset,
  act,
}: {
  preset: ProviderPreset;
  act: (work: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="connection-links">
      {(['documentation', 'usage'] as const).map((link) =>
        link === 'usage' && !preset.usageUrl ? null : (
          <button
            key={link}
            onClick={() =>
              void act(async () => {
                await request(`/provider-presets/${preset.id}/open`, 'POST', { link });
              })
            }
          >
            {t(link)} <ExternalLink size={12} />
          </button>
        ),
      )}
    </div>
  );
}
