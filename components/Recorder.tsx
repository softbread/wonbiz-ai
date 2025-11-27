import React, { useState, useRef, useEffect } from 'react';
import { MicIcon, StopIcon } from './Icons';
import { formatDuration } from '../services/audioUtils';

interface RecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number[]>(new Array(10).fill(10));
  
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
        <h2 className="text-2xl font-light text-plaud-text tracking-wide">Recording Voice Note</h2>
        <p className="text-plaud-gray text-sm font-mono tracking-widest uppercase">AssemblyAI + LlamaIndex</p>
      </div>

      <div className="text-6xl font-thin font-mono tabular-nums text-white">
        {formatDuration(duration)}
      </div>

      {/* Visualizer */}
      <div className="flex items-center justify-center h-24 space-x-2">
        {audioLevel.map((level, i) => (
          <div 
            key={i} 
            className="w-3 bg-plaud-accent rounded-full transition-all duration-75"
            style={{ height: `${Math.max(10, level)}%`, opacity: isRecording ? 1 : 0.5 }}
          />
        ))}
      </div>

      <div className="flex gap-6">
         <button 
          onClick={onCancel}
          className="px-8 py-3 rounded-full text-plaud-text border border-plaud-gray hover:bg-plaud-gray transition-colors"
        >
          Cancel
        </button>

        <button 
          onClick={stopRecording}
          className="group relative flex items-center justify-center w-20 h-20 bg-plaud-accent rounded-full hover:scale-105 transition-transform"
        >
            <div className="absolute inset-0 rounded-full border border-white opacity-20 animate-ping"></div>
            <StopIcon className="w-8 h-8 text-plaud-black" />
        </button>
      </div>
    </div>
  );
};

export default Recorder;
