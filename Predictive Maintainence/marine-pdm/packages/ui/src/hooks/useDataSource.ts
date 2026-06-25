import { useState, useEffect, useRef } from 'react';
import type { IDataSource, EngineSnapshot } from '@marine-pdm/shared';

export function useDataSource(source: IDataSource) {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(source.getLatest());
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    const current = sourceRef.current;
    current.subscribe((snap) => setSnapshot(snap));
    return () => {
      current.unsubscribe();
    };
  }, [source]);

  return snapshot;
}
