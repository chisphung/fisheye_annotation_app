import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CachedFrame {
  id: string;
  frame: string;
  originalTrack: string;
  dataset: string;
  split: string;
}

interface CacheContextType {
  cachedFrames: CachedFrame[];
  addFrameToCache: (frame: CachedFrame) => void;
  removeFrameFromCache: (id: string) => void;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export function CacheProvider({ children }: { children: React.ReactNode }) {
  const [cachedFrames, setCachedFrames] = useState<CachedFrame[]>(() => {
    const saved = localStorage.getItem('annotator_cache');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('annotator_cache', JSON.stringify(cachedFrames));
  }, [cachedFrames]);

  const addFrameToCache = (frame: CachedFrame) => {
    setCachedFrames(prev => {
      if (prev.find(p => p.id === frame.id)) return prev;
      return [...prev, frame];
    });
  };

  const removeFrameFromCache = (id: string) => {
    setCachedFrames(prev => prev.filter(p => p.id !== id));
  };

  return (
    <CacheContext.Provider value={{ cachedFrames, addFrameToCache, removeFrameFromCache }}>
      {children}
    </CacheContext.Provider>
  );
}

export function useCache() {
  const context = useContext(CacheContext);
  if (!context) throw new Error("useCache must be used within CacheProvider");
  return context;
}
