
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X, Sparkles, Volume2, StopCircle, AlertCircle, Wand2, Loader2, Image as ImageIcon } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { StyleProfile } from '../types';
import { generateFromGraph } from '../services/geminiService';

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
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // Chat Logic
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const currentTurnRef = useRef<string>('');
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const scheduledAudioSources = useRef<AudioBufferSourceNode[]>([]);

  // Visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const cleanupAudio = () => {
    // Stop all playing sources
    scheduledAudioSources.current.forEach(node => {
        try { node.stop(); } catch(e) {}
    });
    scheduledAudioSources.current = [];

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (sessionRef.current) {
       try { sessionRef.current.close(); } catch(e) {}
       sessionRef.current = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    cancelAnimationFrame(animationFrameRef.current);
  };

  const connectToLiveAPI = async () => {
    setError(null);
    try {
      setStatus('connecting');

      // Explicitly request echo cancellation to prevent AI hearing itself
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
          } 
      });
      mediaStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
      
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const systemInstruction = `
        You are PaletteAI's Creative Director. Today is ${today}.
        
        Role: A concise, high-energy Digital Content Strategist.
        Goal: Brainstorm content ideas and dictate prompt suggestions for image generation.
        
        Rules:
        1. Speak strictly in English.
        2. BE CONCISE. Do not ramble.
        3. If the user interrupts, stop talking immediately.
        4. When the user asks for an image or you suggest one, IMMEDIATELLY output the prompt tag.
           Format: "IMAGE_PROMPT: [The detailed prompt description here]"
        
        Keep responses short and helpful.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            setStatus('listening');
            setIsActive(true);
            
            if (!audioContextRef.current || !mediaStreamRef.current) return;

            const inputCtx = new AudioContext({ sampleRate: 16000 });
            const source = inputCtx.createMediaStreamSource(mediaStreamRef.current);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            analyzerRef.current = inputCtx.createAnalyser();
            analyzerRef.current.fftSize = 256;
            source.connect(analyzerRef.current);
            visualize();

            processor.onaudioprocess = (e) => {
              if (isMuted) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                 const s = Math.max(-1, Math.min(1, inputData[i]));
                 pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
            sourceRef.current = source as any;
            processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Handle Interruption
             if (msg.serverContent?.interrupted) {
                 console.log("Interrupted by user");
                 // Stop all currently playing audio
                 scheduledAudioSources.current.forEach(source => {
                     try { source.stop(); } catch(e) {}
                 });
                 scheduledAudioSources.current = [];
                 nextStartTimeRef.current = 0;
                 setStatus('listening');
                 return;
             }

             // Audio Output
             const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (audioData) {
                setStatus('speaking');
                playAudioChunk(audioData);
             }
             
             // Transcription Handling
             if (msg.serverContent?.outputTranscription?.text) {
                 currentTurnRef.current += msg.serverContent.outputTranscription.text;
             }
             
             // Input Transcription (User)
             if (msg.serverContent?.inputTranscription?.text) {
                 const text = msg.serverContent.inputTranscription.text;
                 setChatHistory(prev => {
                     const last = prev[prev.length - 1];
                     if (last && last.role === 'user') {
                         return [...prev.slice(0, -1), { ...last, text: last.text + text }];
                     }
                     return [...prev, { id: crypto.randomUUID(), role: 'user', text }];
                 });
             }

             if (msg.serverContent?.turnComplete) {
                 setTimeout(() => setStatus('listening'), 500); // Shorter pause
                 
                 // Process Model Turn
                 if (currentTurnRef.current) {
                     const fullText = currentTurnRef.current;
                     const isPrompt = fullText.includes("IMAGE_PROMPT:");
                     const cleanText = fullText.replace(/IMAGE_PROMPT:/g, "").trim();
                     
                     setChatHistory(prev => [
                         ...prev, 
                         { 
                             id: crypto.randomUUID(), 
                             role: 'model', 
                             text: cleanText,
                             isPrompt: isPrompt 
                         }
                     ]);
                     
                     // Auto-scroll to prompt if detected
                     if (isPrompt && chatScrollRef.current) {
                         setTimeout(() => {
                             chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
                         }, 100);
                     }

                     currentTurnRef.current = '';
                 }
             }
          },
          onclose: () => {
            setIsActive(false);
            setStatus('idle');
          },
          onerror: (e) => {
            console.error(e);
            setError("Connection disrupted.");
            setStatus('idle');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      });
      
      sessionRef.current = await sessionPromise;

    } catch (e: any) {
      console.error("Connection failed", e);
      setIsActive(false);
      setStatus('idle');
      if (e.name === 'NotAllowedError' || e.message?.includes('permission')) {
          setError("Microphone access denied.");
      } else {
          setError("Connection failed.");
      }
    }
  };

  const playAudioChunk = async (base64: string) => {
      if (!audioContextRef.current) return;
      try {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        const int16 = new Int16Array(bytes.buffer);
        const buffer = audioContextRef.current.createBuffer(1, int16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => {
            scheduledAudioSources.current = scheduledAudioSources.current.filter(s => s !== source);
            if (scheduledAudioSources.current.length === 0) {
                setStatus('listening');
            }
        };

        const currentTime = audioContextRef.current.currentTime;
        const startTime = Math.max(currentTime, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + buffer.duration;
        
        scheduledAudioSources.current.push(source);
      } catch (e) {
          console.error("Audio playback error", e);
      }
  };

  const visualize = () => {
    if (!canvasRef.current || !analyzerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bufferLength = analyzerRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
        if (!analyzerRef.current) return;
        animationFrameRef.current = requestAnimationFrame(draw);
        analyzerRef.current.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = 30;
        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
             const barHeight = dataArray[i] / 3;
             const angle = (i * 2 * Math.PI) / bufferLength;
             if (status === 'speaking') ctx.strokeStyle = `hsl(${270 + barHeight}, 100%, 60%)`;
             else ctx.strokeStyle = `hsl(${160 + barHeight}, 100%, 50%)`;
             const x = cx + Math.cos(angle) * (radius + barHeight);
             const y = cy + Math.sin(angle) * (radius + barHeight);
             if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.lineWidth = 2;
        ctx.stroke();
    };
    draw();
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
    return () => cleanupAudio();
  }, []);

  const handleToggle = () => {
      if (isActive) {
          cleanupAudio();
          setIsActive(false);
          setStatus('idle');
      } else {
          connectToLiveAPI();
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

            {/* Visualizer (Compact) */}
            <div className="h-24 relative bg-zinc-900/50 flex-shrink-0 border-b border-zinc-900">
                 <canvas ref={canvasRef} width={400} height={100} className="absolute inset-0 w-full h-full" />
                 {error && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-xs gap-2">
                        <AlertCircle size={14}/> {error}
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
