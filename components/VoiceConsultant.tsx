
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X, Sparkles, AlertCircle, Wand2, Loader2, Image as ImageIcon } from 'lucide-react';
import { StyleProfile } from '../types';
import { generateFromGraph } from '../services/fluxService';
import { generateAssistantText } from '../services/hfTextService';

interface VoiceConsultantProps {
  activeProfile: StyleProfile | null;
  onClose: () => void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    isPrompt?: boolean;
    image?: string; // Generated image URL
    isGenerating?: boolean;
}

export const VoiceConsultant: React.FC<VoiceConsultantProps> = ({ activeProfile, onClose }) => {
    const [isActive, setIsActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false); // TTS mute
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // Chat Logic
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const currentTurnRef = useRef<string>('');
  
    const recognitionRef = useRef<any>(null);
    const isBusyRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

    const cleanup = () => {
        try {
            recognitionRef.current?.stop?.();
        } catch (e) {}
        recognitionRef.current = null;
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        setIsActive(false);
        setStatus('idle');
    };

    const speak = (text: string) => {
        if (isMuted) return;
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.05;
        utter.onstart = () => setStatus('speaking');
        utter.onend = () => setStatus('listening');
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
    };

    const askAssistant = async (userText: string) => {
        if (isBusyRef.current) return;
        isBusyRef.current = true;
        setError(null);

        setChatHistory((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: userText }]);
        setStatus('connecting');

        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const styleHint = activeProfile
            ? `Active style: ${activeProfile.name}. Technique: ${activeProfile.visualTechnique}. Moods: ${activeProfile.moods?.join(', ') || 'n/a'}. Palette: ${activeProfile.palette?.slice(0, 5).join(', ') || 'n/a'}.`
            : 'No active style. Raw mode.';

        const system = `You are PaletteAI's Creative Director. Today is ${today}.\n\nRole: A concise, high-energy Digital Content Strategist.\nGoal: Brainstorm content ideas and output prompt suggestions for image generation.\n\nRules:\n1) Speak strictly in English.\n2) BE CONCISE. Do not ramble.\n3) When you suggest an image prompt, include a line that starts with: IMAGE_PROMPT: ...\n4) Keep prompts detailed (subject, setting, lighting, style, camera).\n\nContext: ${styleHint}`;

        try {
            const assistant = await generateAssistantText([
                { role: 'system', content: system },
                { role: 'user', content: userText }
            ]);

            const isPrompt = assistant.includes('IMAGE_PROMPT:');
            const cleanText = assistant.replace(/IMAGE_PROMPT:/g, '').trim();

            setChatHistory((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: 'model', text: cleanText, isPrompt }
            ]);

            speak(cleanText);
            setStatus('listening');
        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'HF assistant failed.');
            setStatus('idle');
        } finally {
            isBusyRef.current = false;
        }
    };

  const handleGenerate = async (msgId: string, prompt: string) => {
      // Find message and set loading
      setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, isGenerating: true } : m));
      
      try {
          const refs = activeProfile ? activeProfile.referenceImages : [];
          // Extract the prompt part if needed, or use the whole text (usually the text is already cleaned to just the prompt description)
          const base64 = await generateFromGraph(
              prompt, 
              prompt, 
              refs, 
              [], 
              "1:1"
          );
          
          setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, isGenerating: false, image: base64 } : m));
      } catch (e) {
          console.error("Gen failed", e);
          setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, isGenerating: false } : m));
      }
  };

  useEffect(() => {
        return () => cleanup();
  }, []);

  const handleToggle = () => {
            setError(null);
            if (isActive) {
                cleanup();
                return;
            }

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                setError('Speech recognition not supported in this browser.');
                return;
            }

            const rec = new SpeechRecognition();
            rec.lang = 'en-US';
            rec.interimResults = false;
            rec.continuous = true;

            rec.onstart = () => {
                setIsActive(true);
                setStatus('listening');
            };

            rec.onerror = (e: any) => {
                console.error(e);
                setError('Microphone or speech recognition error.');
                setStatus('idle');
                setIsActive(false);
            };

            rec.onresult = (event: any) => {
                try {
                    const last = event.results[event.results.length - 1];
                    const text = (last?.[0]?.transcript || '').trim();
                    if (text) askAssistant(text);
                } catch (e) {}
            };

            rec.onend = () => {
                // If user didn't explicitly stop, keep it running while active
                if (recognitionRef.current && isActive) {
                    try { recognitionRef.current.start(); } catch (e) {}
                }
            };

            recognitionRef.current = rec;
            try {
                rec.start();
            } catch (e) {
                setError('Failed to start microphone.');
                setIsActive(false);
                setStatus('idle');
            }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col">
            
            {/* Header */}
            <div className="p-4 flex justify-between items-center border-b border-zinc-900 bg-zinc-950 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center animate-pulse">
                        <Sparkles className="text-white" size={16} />
                    </div>
                    <div>
                        <h2 className="text-white font-bold text-sm">Creative Director</h2>
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                            {status === 'idle' ? 'Offline' : status}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

                        {/* Status / Error */}
                        <div className="h-16 relative bg-zinc-900/50 flex-shrink-0 border-b border-zinc-900 flex items-center justify-center">
                                {error ? (
                                    <div className="flex items-center justify-center text-red-400 text-xs gap-2 px-4 text-center">
                                        <AlertCircle size={14}/> {error}
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">
                                        {isActive ? 'Listening… speak now' : 'Tap mic to talk'}
                                    </div>
                                )}
                        </div>

            {/* Chat Feed */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-zinc-950">
                {chatHistory.length === 0 && (
                    <div className="text-center text-zinc-600 mt-10 text-sm">
                        <p>Ask for content ideas...</p>
                        <p className="text-xs opacity-50 mt-1">"Create a Halloween post for my cafe"</p>
                    </div>
                )}
                {chatHistory.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                            msg.role === 'user' 
                            ? 'bg-zinc-800 text-zinc-200 rounded-tr-sm' 
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-sm'
                        }`}>
                            {msg.text}
                            
                            {/* Prompt Card */}
                            {msg.isPrompt && (
                                <div className="mt-3 pt-3 border-t border-zinc-800">
                                    <div className="flex items-center gap-2 mb-2 text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                                        <Wand2 size={10}/> Suggested Prompt
                                    </div>
                                    
                                    {msg.image ? (
                                        <div className="rounded-lg overflow-hidden border border-zinc-700 mt-2">
                                            <img src={msg.image} className="w-full h-auto" />
                                            <a href={msg.image} download className="block text-center py-2 bg-zinc-800 hover:bg-zinc-700 text-xs text-white font-medium transition-colors">
                                                Download Asset
                                            </a>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleGenerate(msg.id, msg.text)}
                                            disabled={msg.isGenerating}
                                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                        >
                                            {msg.isGenerating ? <Loader2 size={12} className="animate-spin"/> : <ImageIcon size={12}/>}
                                            Generate Preview
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Controls Footer */}
            <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex justify-center items-center gap-6">
                 <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-3 rounded-full border transition-all ${isMuted ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}
                 >
                     <MicOff size={20} />
                 </button>

                 <button 
                    onClick={handleToggle}
                    className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isActive ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-white hover:bg-zinc-200 shadow-white/10'}`}
                 >
                     {isActive ? <StopCircle size={32} className="text-white fill-white"/> : <Mic size={32} className="text-black fill-black"/>}
                 </button>
                 
                 <div className="text-[10px] text-zinc-500 font-mono absolute bottom-2 right-4">
                     {activeProfile ? `Using: ${activeProfile.name}` : 'Raw Mode'}
                 </div>
            </div>
        </div>
    </div>
  );
};
