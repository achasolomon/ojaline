import { useState, useEffect } from 'react';
import { getStates, getLgas, getClusters, type StateLocation, type LgaLocation, type Cluster } from '../lib/api';

interface LocationFilterProps {
  selectedState: string | null;
  selectedLga: string | null;
  selectedClusterId: string | null;
  onSelect: (filters: { state: string | null; lga: string | null; cluster_id: string | null }) => void;
}

export function LocationFilter({ selectedState, selectedLga, selectedClusterId, onSelect }: LocationFilterProps) {
  const [states, setStates] = useState<StateLocation[]>([]);
  const [lgas, setLgas] = useState<LgaLocation[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingLgas, setLoadingLgas] = useState(false);
  const [loadingClusters, setLoadingClusters] = useState(false);

  useEffect(() => {
    getStates().then(setStates).catch(() => {}).finally(() => setLoadingStates(false));
  }, []);

  useEffect(() => {
    if (!selectedState) { setLgas([]); return; }
    setLoadingLgas(true);
    getLgas(selectedState).then(setLgas).catch(() => {}).finally(() => setLoadingLgas(false));
  }, [selectedState]);

  useEffect(() => {
    if (!selectedLga) { setClusters([]); return; }
    setLoadingClusters(true);
    getClusters(undefined, selectedLga).then(setClusters).catch(() => {}).finally(() => setLoadingClusters(false));
  }, [selectedLga]);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-text uppercase tracking-wide">Location</h3>

      {/* State */}
      <div>
        <label className="block text-[10px] text-text-secondary font-semibold mb-1 uppercase">State</label>
        {loadingStates ? (
          <div className="h-9 bg-surface rounded-lg animate-pulse" />
        ) : (
          <select
            value={selectedState || ''}
            onChange={(e) => onSelect({ state: e.target.value || null, lga: null, cluster_id: null })}
            className="w-full h-9 px-3 border border-border rounded-lg bg-white text-xs text-text outline-none focus:border-primary transition cursor-pointer"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s.state} value={s.state}>{s.state} ({s.cluster_count})</option>
            ))}
          </select>
        )}
      </div>

      {/* LGA */}
      <div>
        <label className="block text-[10px] text-text-secondary font-semibold mb-1 uppercase">Local Government</label>
        {loadingLgas ? (
          <div className="h-9 bg-surface rounded-lg animate-pulse" />
        ) : (
          <select
            value={selectedLga || ''}
            onChange={(e) => onSelect({ state: selectedState, lga: e.target.value || null, cluster_id: null })}
            disabled={!selectedState}
            className="w-full h-9 px-3 border border-border rounded-lg bg-white text-xs text-text outline-none focus:border-primary transition cursor-pointer disabled:opacity-40"
          >
            <option value="">All LGAs</option>
            {lgas.map((l) => (
              <option key={l.lga} value={l.lga}>{l.lga} ({l.cluster_count})</option>
            ))}
          </select>
        )}
      </div>

      {/* Area / Ward */}
      <div>
        <label className="block text-[10px] text-text-secondary font-semibold mb-1 uppercase">Area / Ward</label>
        {loadingClusters ? (
          <div className="h-9 bg-surface rounded-lg animate-pulse" />
        ) : (
          <select
            value={selectedClusterId || ''}
            onChange={(e) => onSelect({ state: selectedState, lga: selectedLga, cluster_id: e.target.value || null })}
            disabled={!selectedLga}
            className="w-full h-9 px-3 border border-border rounded-lg bg-white text-xs text-text outline-none focus:border-primary transition cursor-pointer disabled:opacity-40"
          >
            <option value="">All Areas</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Active filters summary */}
      {(selectedState || selectedLga || selectedClusterId) && (
        <button
          type="button"
          onClick={() => onSelect({ state: null, lga: null, cluster_id: null })}
          className="w-full text-[10px] text-primary font-semibold bg-primary-light rounded-lg px-3 py-2 border-none cursor-pointer hover:bg-primary/10 transition"
        >
          ✕ Clear all filters
        </button>
      )}
    </div>
  );
}
