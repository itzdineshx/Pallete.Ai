import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Sparkles, Image as ImageIcon, CheckCircle2, Activity, Cpu, ScanEye } from 'lucide-react';
import { analyzeStyle } from '../services/fluxService';
import { StyleAnalysisResponse } from '../types';

interface StyleUploaderProps {
  onStyleAnalyzed: (analysis: StyleAnalysisResponse, images: string[]) => void;
}

export const StyleUploader: React.FC<StyleUploaderProps> = ({ onStyleAnalyzed }) => {
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thinking Log State
  const [logs, setLogs] = useState<{msg: string, time: number}[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, { msg, time: Date.now() }]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const combinedFiles = [...images, ...newFiles].slice(0, 5); // Max 5
      setImages(combinedFiles);
      
      // Generate previews
      const newPreviews = combinedFiles.map(file => URL.createObjectURL(file));
      setPreviews(newPreviews);
      setError(null);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);

    const newPreviews = [...previews];
    URL.revokeObjectURL(newPreviews[index]);
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);
  };

  const handleAnalyze = async () => {
    if (images.length < 3) {
      setError("Please upload at least 3 images for accurate style extraction.");
      return;
    }

    setIsAnalyzing(true);
    setLogs([]);
    setError(null);

    try {
      addLog("Initializing Pre-processing...");
      
      const base64Images = await Promise.all(images.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }));

      // Calls the new extractVisualFeatures via the alias
      const analysis = await analyzeStyle(images, (status) => {
        addLog(status);
      });
      
      addLog("Workflow Complete. Saving to Style DB...");
      setTimeout(() => {
          onStyleAnalyzed(analysis, base64Images);
      }, 800);

    } catch (err) {
      console.error(err);
      setError("Feature extraction failed. Please try again.");
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-6 md:p-12 animate-fade-in max-w-5xl mx-auto">
      {!isAnalyzing ? (
        <>
            <div className="mb-10 text-center">
                <h2 className="text-4xl font-bold text-white mb-3 tracking-tight font-display">Multi-Image Style Graph</h2>
                <p className="text-zinc-400 max-w-lg mx-auto leading-relaxed">
                    Upload 3-5 reference images. The system will extract features, generate vector embeddings, and construct a reusable style node.
                </p>
            </div>

            {/* Drop Zone / Image Grid */}
            <div className="flex-1 bg-zinc-900/30 border border-dashed border-zinc-700/50 rounded-3xl p-8 relative flex flex-col items-center justify-center min-h-[400px] transition-all hover:bg-zinc-900/50 hover:border-zinc-600 group/dropzone">
                
                {previews.length === 0 ? (
                <div className="text-center cursor-pointer p-10" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6 group-hover/dropzone:scale-110 transition-transform duration-300 shadow-xl">
                       <Upload className="text-zinc-400 group-hover/dropzone:text-white transition-colors" size={32} />
                    </div>
                    <p className="text-zinc-200 font-semibold text-lg mb-2">Upload Reference Data</p>
                    <p className="text-zinc-500 text-sm">Input Node: JPG, PNG • Max 5</p>
                </div>
                ) : (
                <div className="w-full max-w-3xl grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {previews.map((src, idx) => (
                    <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-zinc-800 shadow-2xl ring-1 ring-white/5 hover:ring-purple-500/50 transition-all duration-300 hover:scale-105 hover:-translate-y-1">
                        <img src={src} alt="upload preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                            onClick={() => removeImage(idx)}
                            className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full backdrop-blur-md shadow-lg transition-transform hover:scale-110"
                            >
                            <X size={16} />
                            </button>
                        </div>
                    </div>
                    ))}
                    {previews.length < 5 && (
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-800/30 hover:bg-zinc-800 hover:border-zinc-500 flex flex-col items-center justify-center text-zinc-500 hover:text-white transition-all duration-300 gap-2 group/add"
                    >
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center group-hover/add:bg-zinc-700 transition-colors">
                            <ImageIcon size={20} />
                        </div>
                        <span className="text-xs font-medium">Add Node</span>
                    </button>
                    )}
                </div>
                )}

                <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                multiple 
                accept="image/*" 
                className="hidden" 
                />
            </div>

            {error && (
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 text-sm text-center flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                   <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"/> {error}
                </div>
            )}

            <div className="mt-10 max-w-md mx-auto w-full">
                <button
                onClick={handleAnalyze}
                disabled={images.length < 3}
                className={`w-full py-4 rounded-xl font-bold text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 shadow-xl
                    ${images.length < 3 
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                    : 'bg-white text-black hover:bg-zinc-200 hover:scale-[1.02] active:scale-[0.98] shadow-white/10'}`}
                >
                <Sparkles size={18} className={images.length >= 3 ? "text-purple-600 fill-purple-600" : ""} />
                Start Extraction Workflow
                </button>
            </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-900/20 rounded-3xl border border-zinc-800/50 backdrop-blur-sm">
            {/* Thinking Visualizer */}
            <div className="w-full max-w-lg relative">
                <div className="absolute -inset-8 bg-purple-500/10 rounded-full blur-2xl animate-pulse duration-[3000ms]"></div>
                <div className="relative bg-zinc-950 border border-zinc-800 rounded-2xl p-8 shadow-2xl overflow-hidden ring-1 ring-white/5">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8 border-b border-zinc-800 pb-5">
                        <div className="flex items-center gap-3">
                            <Activity className="text-purple-500 animate-pulse" size={20} />
                            <span className="font-mono text-xs font-bold text-purple-300 tracking-wider">SYSTEM PROCESSING</span>
                        </div>
                        <span className="text-[10px] text-zinc-600 font-mono">FLOW: EXTRACT {'->'} EMBED</span>
                    </div>

                    {/* Progress Steps */}
                    <div className="space-y-6 font-mono text-sm relative">
                        {/* Connecting Line */}
                        <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-zinc-800 -z-10"></div>

                        {/* Step 1: Preprocessing */}
                        <div className={`flex items-center gap-4 transition-all duration-500 ${logs.some(l => l.msg.includes("Pre-processing")) ? 'text-white translate-x-1' : 'text-zinc-600'}`}>
                            {logs.some(l => l.msg.includes("Pre-processing")) 
                                ? <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_10px_rgba(34,197,94,0.5)]"><CheckCircle2 size={12} className="text-black"/></div> 
                                : <div className="w-4 h-4 rounded-full border-2 border-zinc-700 bg-zinc-900" />}
                            <span className="font-semibold tracking-tight">Pre-processing (Normalize)</span>
                        </div>

                        {/* Step 2: Feature Extraction */}
                        <div className={`flex items-center gap-4 transition-all duration-500 ${logs.some(l => l.msg.includes("Feature Extraction")) ? 'text-white translate-x-1' : 'text-zinc-600'}`}>
                            {logs.some(l => l.msg.includes("Feature Extraction")) 
                                ? <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.5)]"><ScanEye size={10} className="text-white animate-spin-slow"/></div> 
                                : <div className="w-4 h-4 rounded-full border-2 border-zinc-700 bg-zinc-900" />}
                            <span className="font-semibold tracking-tight">Feature Extraction (JSON)</span>
                        </div>

                         {/* Step 3: Vector */}
                        <div className={`flex items-center gap-4 transition-all duration-500 ${logs.some(l => l.msg.includes("Vectorization")) ? 'text-white translate-x-1' : 'text-zinc-600'}`}>
                            {logs.some(l => l.msg.includes("Vectorization")) 
                                ? <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.5)]"><Cpu size={10} className="text-white"/></div> 
                                : <div className="w-4 h-4 rounded-full border-2 border-zinc-700 bg-zinc-900" />}
                            <span className="font-semibold tracking-tight">Vector Embedding (DB)</span>
                        </div>
                    </div>

                    {/* Terminal Log */}
                    <div className="mt-8 pt-4 border-t border-zinc-800">
                        <div className="h-32 overflow-y-auto font-mono text-[10px] space-y-2 text-zinc-500 scrollbar-hide">
                            {logs.map((log, i) => (
                                <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                    <span className="text-zinc-700 select-none">[{new Date(log.time).toLocaleTimeString().split(' ')[0]}]</span>
                                    <span className={i === logs.length - 1 ? "text-purple-400 font-bold" : ""}>{log.msg}</span>
                                </div>
                            ))}
                            <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
