import { useState } from 'react';
import { useCache } from '../context/CacheContext';
import { Layers, Download, X, CopyMinus, Maximize2, Minimize2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function CacheDock() {
  const { cachedFrames, removeFrameFromCache } = useCache();
  const { dataset, split, trackId } = useParams();
  const [isMinimized, setIsMinimized] = useState(false);

  if (cachedFrames.length === 0) return null;

  const handleAssign = async (c: any) => {
    // If not in an annotation page, warn user
    if (!dataset || !split || !trackId) {
       alert("You must open a tracking sequence page to assign frames!");
       return;
    }
    
    // Safety check if dataset/split match
    if (c.dataset !== dataset || c.split !== split) {
       alert(`This cached frame belongs to ${c.dataset}/${c.split}, but you are viewing ${dataset}/${split}!`);
       return;
    }

    try {
      await axios.post('http://localhost:8000/api/assign_cached_frame', {
        ds: c.dataset,
        split: c.split,
        frame: c.frame,
        target_track_id: trackId
      });
      removeFrameFromCache(c.id);
      // Hard refresh to reload trackMeta from backend perfectly
      window.location.reload();
    } catch (err) {
      alert('Failed to assign cached frame');
      console.error(err);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] transition-all">
      <div className={`glass-panel border-indigo-500/30 overflow-hidden transition-all duration-300 flex flex-col ${isMinimized ? 'w-48 h-14 rounded-full' : 'w-96 rounded-2xl shadow-2xl drop-shadow-[0_0_30px_rgba(99,102,241,0.2)]'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg">
              <Layers className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="font-display font-bold text-slate-200">
               Clipboard <span className="ml-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded-full">{cachedFrames.length}</span>
            </div>
          </div>
          <button className="text-slate-400 hover:text-white transition">
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-4 max-h-[60vh] overflow-y-auto flex flex-col gap-3 bg-slate-950/40">
            {cachedFrames.map(c => (
              <div key={c.id} className="group relative bg-slate-900/60 border border-white/5 rounded-xl p-3 flex gap-4 items-center hover:border-indigo-500/30 transition-colors">
                
                <div className="relative w-20 h-20 bg-black/50 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                  <img 
                    src={`http://localhost:8000/api/crop/${c.dataset}/${c.split}/${c.frame}/${c.originalTrack}`}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                       // If track crop fails because it was moved or API is slow, fallback to full image
                       e.currentTarget.src = `http://localhost:8000/api/image/${c.dataset}/${c.split}/${c.frame}`;
                    }}
                  />
                  <div className="absolute top-1 left-1 bg-black/60 px-1 rounded text-[10px] font-mono text-white/50 border border-white/10">#{c.originalTrack}</div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 truncate font-mono mb-2" title={c.frame}>{c.frame}</p>
                  
                  <div className="flex items-center gap-2">
                    {/* Discard button */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeFrameFromCache(c.id); }}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition"
                      title="Discard from clipboard"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    
                    {/* Assign Button */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAssign(c); }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg hover:shadow-indigo-500/25 transition"
                    >
                      <Download className="w-4 h-4" /> 
                      {trackId ? `Drop to Track #${trackId}` : 'Open track to assign'}
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
