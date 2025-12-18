import React, { useState, useRef, useEffect } from 'react';
import { MicIcon, StopIcon } from './Icons';
import { formatDuration } from '../services/audioUtils';
import { AppLanguage, i18n } from '../types';

interface RecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onCancel: () => void;
  language?: AppLanguage;
}

const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onCancel, language = 'en' }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number[]>(new Array(10).fill(10));
  const [showWarning, setShowWarning] = useState(false);
  
  // Maximum recording duration in seconds (15 minutes to stay well under 16MB limit)
  const MAX_RECORDING_DURATION = 15 * 60; // 15 minutes
  const WARNING_THRESHOLD = 14 * 60; // Show warning at 14 minutes
  
  // Get translated text
  const t = (key: string) => i18n[language][key] || key;
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    startRecording();
    return () => {
      stopResources();
      setDuration(0);
      durationRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopResources = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (sourceRef.current) sourceRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    durationRef.current = 0;
  };

  const startRecording = async () => {
    try {
      setShowWarning(false); 

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      // Audio Visualization Setup
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 32;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const finalDuration = durationRef.current;
        console.log('Recording stopped, final duration:', finalDuration);
        onRecordingComplete(blob, finalDuration);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        durationRef.current = elapsed;
        setDuration(elapsed);
        
        // Show warning when approaching limit
        if (elapsed >= WARNING_THRESHOLD && !showWarning) {
          setShowWarning(true); 
        }
        
        // Auto-stop when reaching maximum duration
        if (elapsed >= MAX_RECORDING_DURATION) {
          console.log('Auto-stopping recording due to maximum duration limit');
          stopRecording();
        }
      }, 1000);

      visualize();

    } catch (err) {
      console.error("Error accessing microphone", err);
      onCancel();
    }
  };

  const visualize = () => {
    if (!analyserRef.current) return;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Pick 10 representative frequencies
    const step = Math.floor(bufferLength / 10);
    const levels = [];
    for (let i = 0; i < 10; i++) {
        levels.push(dataArray[i * step] / 2.5); // Normalize slightly
    }
    setAudioLevel(levels);

    animationFrameRef.current = requestAnimationFrame(visualize);
  };

  const stopRecording = () => {
    console.log('Stop recording clicked, current duration:', duration, 'ref duration:', durationRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-10 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-light text-wonbiz-text tracking-wide">{t('recording')}</h2>
        <p className="text-wonbiz-gray text-sm font-mono tracking-widest uppercase">AssemblyAI + LlamaIndex</p>
      </div>

      {/* Warning message when approaching limit */}
      {showWarning && (
        <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-300 px-4 py-2 rounded-lg text-sm">
          ⚠️ {language === 'zh' ? '即将达到15分钟限制，录音将自动停止' : 'Approaching 15 min limit. Recording will auto-stop.'}
        </div>
      )}

      <div className="text-6xl font-thin font-mono tabular-nums text-white">
        {formatDuration(duration)}
        <span className="text-lg text-wonbiz-gray ml-2">/ {formatDuration(MAX_RECORDING_DURATION)}</span>
      </div>

      {/* Visualizer */}
      <div className="flex items-center justify-center h-24 space-x-2">
        {audioLevel.map((level, i) => (
          <div 
            key={i} 
            className="w-3 bg-wonbiz-accent rounded-full transition-all duration-75"
            style={{ height: `${Math.max(10, level)}%`, opacity: isRecording ? 1 : 0.5 }}
          />
        ))}
      </div>

      <div className="flex gap-6">
         <button 
          onClick={onCancel}
          className="px-8 py-3 rounded-full text-wonbiz-text border border-wonbiz-gray hover:bg-wonbiz-gray transition-colors"
        >
          {t('cancel')}
        </button>

        <button 
          onClick={stopRecording}
          className="group relative flex items-center justify-center w-20 h-20 bg-wonbiz-accent rounded-full hover:scale-105 transition-transform"
        >
            <div className="absolute inset-0 rounded-full border border-white opacity-20 animate-ping"></div>
            <StopIcon className="w-8 h-8 text-wonbiz-black" />
        </button>
      </div>
    </div>
  );
};

export default Recorder;
