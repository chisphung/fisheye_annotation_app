import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Save, Map, Play, Pause, Trash2, ArrowLeft, ArrowRight, ArrowDownToLine } from 'lucide-react';
import { useCache } from '../context/CacheContext';

export default function TrackAnnotator() {
  const { dataset, split, trackId } = useParams();
  const [searchParams] = useSearchParams();
  const bestCropFrame = searchParams.get('best');
  const navigate = useNavigate();
  
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [trackMeta, setTrackMeta] = useState<any>(null);

  const [trajectory, setTrajectory] = useState<any[]>([]);
  const [bgFrameIndex, setBgFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const { addFrameToCache } = useCache();

  useEffect(() => {
    let interval: any;
    if (isPlaying && trackMeta && trackMeta.frames.length > 0) {
      interval = setInterval(() => {
        setBgFrameIndex(prev => (prev + 1) % trackMeta.frames.length);
      }, 300); // ~3 FPS
    }
    return () => clearInterval(interval);
  }, [isPlaying, trackMeta]);

  const handleCacheFrame = async (frameToCache: string) => {
    try {
      await axios.post('http://localhost:8000/api/cache_frame', {
        ds: dataset,
        split,
        track_id: trackId,
        frame: frameToCache
      });
      
      // Update local state and instantly remove from UI
      setTrackMeta((prev: any) => ({
        ...prev,
        frames: prev.frames.filter((f: string) => f !== frameToCache)
      }));
      setTrajectory(prev => prev.filter(p => p.frame !== frameToCache));
      setBgFrameIndex(0); // Reset index safely
      
      // Add to global cache clipboard
      addFrameToCache({
        id: `${dataset}_${split}_${trackId}_${frameToCache}`,
        frame: frameToCache,
        originalTrack: trackId || "",
        dataset: dataset || "",
        split: split || ""
      });
      
    } catch (err) {
      console.error(err);
      alert('Failed to cache frame');
    }
  };

  useEffect(() => {
    // Find metadata for this track
    axios.get(`http://localhost:8000/api/meta/tracks?ds=${dataset}&split=${split}`)
      .then(res => {
        const found = res.data.find((t: any) => t.track_id.toString() === trackId);
        setTrackMeta(found);
        
        if (found && found.frames.length > 0) {
          axios.post('http://localhost:8000/api/track_trajectory', {
            ds: dataset,
            split,
            track_id: trackId,
            frames: found.frames
          }).then(res2 => setTrajectory(res2.data.trajectory)).catch(console.error);
        }
      })
      .catch(console.error);
  }, [dataset, split, trackId]);

  const handleSave = async () => {
    if (!label.trim() || !trackMeta) return;
    setSaving(true);
    try {
      await axios.post('http://localhost:8000/api/annotate', {
        ds: dataset,
        split,
        track_id: trackId,
        frames: trackMeta.frames,
        label_text: label.trim().toUpperCase()
      });
      navigate('/');
    } catch (err) {
      console.error(err);
      alert('Failed to save annotation');
    } finally {
      setSaving(false);
    }
  };

  if (!trackMeta) return <div className="p-8 text-white">Loading...</div>;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      <header className="glass-panel border-b border-white/5 p-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Annotate Track #{trackId}</h2>
            <p className="text-sm text-slate-400">{dataset} / {split} • {trackMeta.num_frames} frames</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="text"
            className="bg-slate-950/80 border-2 border-indigo-500/50 rounded-xl px-5 py-2.5 text-white font-mono uppercase text-xl shadow-[0_0_20px_rgba(99,102,241,0.15)] outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 w-80 transition-all placeholder:text-slate-700"
            placeholder="TYPE LICENSE PLATE..."
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button 
            onClick={handleSave}
            disabled={saving || !label.trim()}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all hover:scale-105 active:scale-95"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : 'Apply to Track'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-0">
        
        {/* Left Side: Global Trajectory Map */}
        <div className="hidden lg:flex w-[45%] p-6 flex-col border-r border-white/5 bg-slate-900/20">
          <h3 className="text-xl font-display font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent mb-4 flex items-center gap-2">
            <Map className="w-5 h-5 text-pink-500" /> Global Trajectory Map
          </h3>
          <p className="text-sm text-slate-400 mb-6">Showing movement path across {trackMeta.num_frames} frames over the initial anchor frame.</p>
          
          <div className="flex-1 glass-panel rounded-3xl overflow-hidden flex flex-col items-center justify-center p-4 relative group gap-4">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            
            <div className="relative inline-block max-w-full z-10 rounded-2xl overflow-hidden shadow-2xl drop-shadow-[0_0_30px_rgba(236,72,153,0.1)] shrink-[5] min-h-0">
              <img 
                src={`http://localhost:8000/api/image/${dataset}/${split}/${trackMeta.frames[bgFrameIndex]}`} 
                alt="Current Frame"
                className="max-w-full max-h-[60vh] object-contain opacity-75 group-hover:opacity-100 transition-opacity"
              />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]">
                <defs>
                  <linearGradient id="traj-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="1" />
                  </linearGradient>
                </defs>
                {trajectory.length > 1 && (
                  <polyline 
                    points={trajectory.map(p => `${p.cx * 100},${p.cy * 100}`).join(' ')}
                    fill="none"
                    stroke="url(#traj-grad)"
                    strokeWidth="0.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-80"
                  />
                )}
                {trajectory.map((p, i) => {
                   const isFirst = i === 0;
                   const isLast = i === trajectory.length - 1;
                   const isBest = p.frame === bestCropFrame;
                   
                   let r = 0.3;
                   let fill = "#ec4899";
                   
                   if (isFirst) { r = 0.8; fill = "#fff"; }
                   else if (isLast) { r = 0.8; fill = "#8b5cf6"; }
                   if (isBest) { r = 1.0; fill = "#10b981"; }
                   
                   return (
                     <circle 
                       key={i}
                       cx={p.cx * 100} 
                       cy={p.cy * 100} 
                       r={r} 
                       fill={fill}
                       className={isLast ? 'animate-pulse' : ''}
                       opacity={isFirst || isLast || isBest ? 1 : 0.6}
                     />
                   );
                })}
              </svg>
            </div>
            
            {/* Playback Controls Moved Below */}
            <div className="flex items-center gap-3 bg-slate-950/80 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 z-20 shadow-xl pointer-events-auto shrink-0">
              <button onClick={() => setBgFrameIndex(prev => prev > 0 ? prev - 1 : trackMeta.frames.length - 1)} className="p-2 hover:bg-white/10 rounded-full text-white transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-pink-500 hover:bg-pink-400 rounded-full text-white transition transform hover:scale-110 shadow-[0_0_15px_rgba(236,72,153,0.5)] mx-2">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
              </button>
              <button onClick={() => setBgFrameIndex(prev => (prev + 1) % trackMeta.frames.length)} className="p-2 hover:bg-white/10 rounded-full text-white transition">
                <ArrowRight className="w-5 h-5" />
              </button>
              <div className="ml-4 px-3 py-1 bg-white/5 rounded-md text-sm font-mono text-white/90">
                {bgFrameIndex + 1} / {trackMeta.frames.length}
              </div>
            </div>
            
          </div>
          
          <div className="flex items-center gap-6 mt-4 justify-center text-xs font-medium text-slate-400">
             <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white"></div> Start</div>
             <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div> Current/End</div>
             <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Best Crop Anchor</div>
          </div>
        </div>

        {/* Right Side: Crops */}
        <div className="flex-1 overflow-auto p-6 relative">
          <div className="max-w-5xl mx-auto flex flex-col gap-8">
          
            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col xl:flex-row relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="bg-black/40 flex-1 flex items-center justify-center p-8 min-h-[300px] relative z-10">
              <img 
                src={`http://localhost:8000/api/crop/${dataset}/${split}/${bestCropFrame}/${trackId}`} 
                alt="Best Crop" 
                className="max-w-full max-h-[400px] object-contain rounded-xl border border-white/10 drop-shadow-[0_0_30px_rgba(255,255,255,0.05)]"
              />
            </div>
            <div className="w-full md:w-96 p-8 flex flex-col justify-center border-t md:border-t-0 md:border-l border-white/5 relative z-10 bg-slate-900/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
                <h3 className="text-indigo-400 font-bold tracking-widest text-sm uppercase">Primary Reference</h3>
              </div>
              <p className="text-slate-300 mb-6">
                This is the clearest, largest frame captured for Track #{trackId}. Enter the license plate text above to automatically propagate this label to all {trackMeta.num_frames} frames.
              </p>
              <div className="text-xs text-slate-500 font-mono break-all bg-slate-950/80 p-4 rounded-xl border border-white/5 selection:bg-indigo-500/30">
                {bestCropFrame}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              All Frames ({trackMeta.num_frames})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {trackMeta.frames.map((frame: string) => (
                <div key={frame} className={`bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden border ${frame === bestCropFrame ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.2)] scale-105 z-10' : 'border-white/5'} relative group hover:border-indigo-500/50 transition-all`}>
                  
                  {/* Cache Frame Button Overlay */}
                  <button 
                    onClick={() => handleCacheFrame(frame)}
                    className="absolute top-2 right-2 p-1.5 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-md z-30 opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110 shadow-lg flex items-center gap-1"
                    title="Move to Clipboard to assign to another track"
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                  </button>

                  <div className="h-32 flex items-center justify-center bg-black/40 p-2">
                    <img 
                      src={`http://localhost:8000/api/crop/${dataset}/${split}/${frame}/${trackId}`}
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                  {frame === bestCropFrame && (
                    <div className="absolute top-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black px-3 py-1 rounded-br-xl z-20 shadow-lg tracking-wider">BEST</div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
