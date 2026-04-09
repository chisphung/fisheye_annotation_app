import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Camera, SplitSquareHorizontal, LayoutDashboard } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import TrackAnnotator from './pages/TrackAnnotator';
import SyncTool from './pages/SyncTool';
import { CacheProvider } from './context/CacheContext';
import CacheDock from './components/CacheDock';

function App() {
  return (
    <CacheProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-mesh font-sans relative">
          {/* Glassmorphic Top Navigation */}
          <header className="sticky top-0 z-50 glass-panel border-b border-white/5 px-6 py-4">
            <div className="container mx-auto flex items-center justify-between">
              
              {/* Logo Section */}
              <h1 className="text-2xl font-display font-extrabold flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  LPR Auto-Annotator
                </span>
              </h1>
              
              {/* Navigation links */}
              <nav className="flex items-center gap-2 bg-slate-950/50 p-1.5 rounded-2xl border border-white/5">
                <Link 
                  to="/" 
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-all outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <Link 
                  to="/sync" 
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-all outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <SplitSquareHorizontal className="w-4 h-4"/>
                  Camera Sync
                </Link>
              </nav>
              
            </div>
          </header>
          
          {/* Main Content Area */}
          <main className="flex-1 flex overflow-hidden relative">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/track/:dataset/:split/:trackId" element={<TrackAnnotator />} />
              <Route path="/sync" element={<SyncTool />} />
            </Routes>
          </main>
          
          {/* Global Floating Docks */}
          <CacheDock />
        </div>
      </BrowserRouter>
    </CacheProvider>
  );
}

export default App;
