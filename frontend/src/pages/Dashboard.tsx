import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { LayoutGrid, Clapperboard } from 'lucide-react';

interface ShotMeta {
  shot_id: string;
  num_frames: number;
  first_frame: string;
  frames: string[];
}

export default function Dashboard() {
  const [shots, setShots] = useState<ShotMeta[]>([]);
  const [dataset, setDataset] = useState('normal');
  const [split, setSplit] = useState('train');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`http://localhost:8000/api/meta/shots?ds=${dataset}&split=${split}`)
      .then(res => setShots(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [dataset, split]);

  return (
    <div className="flex-1 overflow-auto p-6 relative">
      <div className="max-w-6xl mx-auto flex flex-col gap-6 relative z-10">
        
        <div className="flex items-center justify-between glass-panel p-5 rounded-2xl">
          <div className="flex gap-4">
            <div className="relative">
              <select 
                value={dataset} 
                onChange={e => setDataset(e.target.value)}
                className="appearance-none bg-slate-950/80 border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-slate-100 font-medium focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all hover:bg-slate-900/80 cursor-pointer"
              >
                <option value="normal">Normal Camera</option>
                <option value="fisheye">Fisheye Camera</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
              </div>
            </div>
            <div className="relative">
              <select 
                value={split} 
                onChange={e => setSplit(e.target.value)}
                className="appearance-none bg-slate-950/80 border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-slate-100 font-medium focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all hover:bg-slate-900/80 cursor-pointer"
              >
                <option value="train">Train</option>
                <option value="val">Val</option>
                <option value="test">Test</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Shots</div>
            <div className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent leading-none">
              {shots.length}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">Loading shots...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {shots.map(s => (
              <Link 
                to={`/shot/${dataset}/${split}/${s.shot_id}`} 
                key={s.shot_id}
                className="group flex flex-col bg-slate-900/50 backdrop-blur-md rounded-2xl overflow-hidden border border-white/5 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] hover:-translate-y-1 cursor-pointer relative"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="h-40 bg-black/40 flex items-center justify-center overflow-hidden p-4">
                  <img 
                    src={`http://localhost:8000/api/image/${dataset}/${split}/${s.first_frame}`} 
                    alt={`Shot ${s.shot_id}`}
                    loading="lazy"
                    className="object-contain h-full w-full group-hover:scale-110 transition-transform duration-500 drop-shadow-2xl"
                  />
                </div>
                <div className="p-5 flex flex-col gap-2 relative z-10 border-t border-white/5">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate" title={s.shot_id}>
                      {s.shot_id}
                    </h3>
                    <div className="bg-indigo-500/20 text-indigo-300 p-1.5 rounded-lg group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <Clapperboard className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="bg-slate-800 px-2 py-1 rounded text-xs font-medium text-slate-300">
                      {s.num_frames} frames
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
