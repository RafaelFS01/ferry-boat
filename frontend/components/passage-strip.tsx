import { formatCoordinate, formatNumber } from '@/lib/format';
import type { NavigationData } from '@/lib/edge-api';
import { BOM_DESPACHO, passageOf, ROUTE_LENGTH_NM, SAO_JOAQUIM, type PassageTerminal } from '@/lib/passage';
import { HullGlyph } from './instrument/hull-glyph';
import { Module } from './module';

const HALF_MILES = Array.from({ length: Math.floor(ROUTE_LENGTH_NM * 2) + 1 }, (_, i) => i / 2);

function TerminalPlate({ terminal, active, align }: { terminal: PassageTerminal; active: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-col ${align === 'right' ? 'items-end text-right' : ''}`}>
      <span className="engraved">{terminal.city}</span>
      <span className={`truncate text-xl font-medium tracking-tight sm:text-2xl ${active ? 'text-ink' : 'text-muted'}`}>{terminal.name}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="engraved">{label}</dt>
      <dd className="font-mono text-lg font-medium leading-none">{value}</dd>
    </div>
  );
}

/**
 * A travessia em linha reta, na mesma orientação da carta: Itaparica a oeste
 * (esquerda) e Salvador a leste (direita), com o ferry na posição real.
 */
export function PassageStrip({ nav, now }: { nav: NavigationData | undefined; now: number }) {
  if (!nav) {
    return (
      <Module label="Travessia">
        <p className="text-base text-muted">Aguardando posição do GPS.</p>
      </Module>
    );
  }

  const passage = passageOf({ lat: nav.latitude, lon: nav.longitude }, nav.rumo_graus, nav.velocidade_nos);
  const toItaparica = passage.destination === BOM_DESPACHO;
  // Distância a partir da borda oeste (Bom Despacho)
  const fromWest = 1 - passage.progress;
  const eta = passage.etaMinutes === null ? null : new Date(now + passage.etaMinutes * 60_000);

  return (
    <Module
      label="Travessia"
      aside={<span className="font-mono text-xs text-muted">{formatNumber(ROUTE_LENGTH_NM, 1)} NM · rota nominal</span>}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-8">
        <TerminalPlate terminal={BOM_DESPACHO} active={toItaparica} align="left" />

        <div className="relative h-14">
          {/* Marcas de meia milha */}
          {HALF_MILES.map((nm) => (
            <span
              key={nm}
              className={`absolute top-1/2 w-px -translate-y-1/2 bg-muted ${Number.isInteger(nm) ? 'h-4 opacity-70' : 'h-2 opacity-40'}`}
              style={{ left: `${(1 - nm / ROUTE_LENGTH_NM) * 100}%` }}
            />
          ))}
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-muted/60" />
          {/* Trecho já navegado, do terminal de origem até o ferry */}
          <span
            className="slide-transition absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent"
            style={toItaparica ? { left: `${fromWest * 100}%`, width: `${passage.progress * 100}%` } : { left: 0, width: `${fromWest * 100}%` }}
          />
          <span className="absolute left-0 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface" />
          <span className="absolute left-full top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface" />
          <span className="slide-transition absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-needle glow" style={{ left: `${fromWest * 100}%`, width: 0 }}>
            <HullGlyph className="-ml-3 h-12 w-6" rotate={toItaparica ? -90 : 90} />
          </span>
        </div>

        <TerminalPlate terminal={SAO_JOAQUIM} active={!toItaparica} align="right" />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line/70 pt-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={`Até ${passage.destination.name}`} value={`${formatNumber(passage.remainingNm, 2)} NM`} />
        <Stat
          label="Chegada estimada"
          value={eta ? `${eta.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${formatNumber(passage.etaMinutes!, 0)} min` : 'Parado'}
        />
        <Stat label="Desvio da rota" value={`${formatNumber(passage.crossTrackNm * 1852, 0)} m`} />
        <Stat label="Posição" value={`${formatCoordinate(nav.latitude, 'lat')} ${formatCoordinate(nav.longitude, 'lon')}`} />
        <Stat label="GPS" value={`${nav.satelites ?? '—'} sat · HDOP ${nav.hdop === undefined ? '—' : formatNumber(nav.hdop, 1)}`} />
      </dl>
    </Module>
  );
}
