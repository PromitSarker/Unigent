import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquarePlus, Paperclip, Loader2, Phone, PhoneOff, Mic, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

function App() {
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Voice Mode State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Audio Streaming Refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const activeSourcesRef = useRef([]);
  const nextPlayTimeRef = useRef(0);

  useEffect(() => {
    setConversationId(generateUUID());
    return () => {
      stopVoiceCall();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setConversationId(generateUUID());
    setMessages([]);
    setInput('');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.assistant_response }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error while processing your request.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startVoiceCall = async () => {
    setIsVoiceMode(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/voice/stream`);
      wsRef.current = ws;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      nextPlayTimeRef.current = 0;

      ws.onopen = () => {
        setIsVoiceConnected(true);
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              let s = Math.max(-1, Math.min(1, inputData[i]));
              pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            ws.send(pcmData.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = async (e) => {
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data);
          if (msg.type === 'interrupted') {
            // Stop current playback
            activeSourcesRef.current.forEach(source => {
              try { source.stop(); } catch(err){}
            });
            activeSourcesRef.current = [];
            nextPlayTimeRef.current = audioCtx.currentTime;
          }
        } else {
          // Play received PCM audio
          const arrayBuffer = await e.data.arrayBuffer();
          const int16Data = new Int16Array(arrayBuffer);
          const float32Data = new Float32Array(int16Data.length);
          for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
          }

          const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 16000);
          audioBuffer.getChannelData(0).set(float32Data);

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);

          source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
          };
          activeSourcesRef.current.push(source);

          const startTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
          source.start(startTime);
          nextPlayTimeRef.current = startTime + audioBuffer.duration;
        }
      };

      ws.onclose = () => {
        stopVoiceCall();
      };

    } catch (err) {
      console.error("Microphone access error", err);
      alert("Microphone access denied or unavailable.");
      setIsVoiceMode(false);
    }
  };

  const stopVoiceCall = () => {
    setIsVoiceMode(false);
    setIsVoiceConnected(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    activeSourcesRef.current = [];
  };

  const toggleVoiceMode = () => {
    if (isVoiceMode) stopVoiceCall();
    else startVoiceCall();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const fileMessage = `Here is my document: ${data.url}`;
      
      const userMessage = { role: 'user', content: fileMessage };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      const chatResponse = await fetch(`/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fileMessage }),
      });

      if (!chatResponse.ok) throw new Error('Failed to get chat response');
      const chatData = await chatResponse.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: chatData.assistant_response }]);
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error uploading your file.' }]);
    } finally {
      setIsUploading(false);
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="RT Communications Logo" className="brand-logo" />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className={`new-chat-btn ${isVoiceMode ? 'active-voice-btn' : ''}`} onClick={toggleVoiceMode} style={{ backgroundColor: isVoiceMode ? '#ef4444' : '' }}>
            {isVoiceMode ? <PhoneOff size={18} /> : <Phone size={18} />}
            {isVoiceMode ? 'End Call' : 'Call'}
          </button>
          <button className="new-chat-btn" onClick={handleNewChat}>
            <MessageSquarePlus size={18} />
            New Chat
          </button>
        </div>
      </header>

      <main className="chat-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <img src="/logo.png" alt="RT Communications Logo" className="empty-state-logo" />
            <h2>How can I help you today?</h2>
            <p>Ask about masking SMS, pricing, or our API features.</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className={`avatar ${msg.role}`}>
                {msg.role === 'user' ? 'U' : 'RT'}
              </div>
              <div className="message-bubble">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="message-wrapper assistant">
            <div className="avatar assistant">RT</div>
            <div className="message-bubble typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="input-container">
        {isVoiceMode ? (
          <div className="voice-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
            <div 
              className={`mic-button ${isVoiceConnected ? 'recording' : ''}`}
              style={{
                width: '80px', height: '80px', borderRadius: '50%',
                backgroundColor: isVoiceConnected ? '#10b981' : '#f59e0b',
                color: 'white', border: 'none',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: isVoiceConnected ? '0 0 20px rgba(16, 185, 129, 0.6)' : 'none',
                transition: 'all 0.3s ease'
              }}
            >
              {isVoiceConnected ? <Activity size={32} /> : <Loader2 size={32} className="spin" />}
            </div>
            <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center' }}>
              {isVoiceConnected ? "Call Connected. Just start talking naturally!" : "Connecting to Gemini..."}
            </p>
          </div>
        ) : (
          <form className="input-form" onSubmit={handleSend}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              accept="image/*,.pdf,.doc,.docx"
            />
            <button
              type="button"
              className="attachment-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              title="Upload Document"
            >
              {isUploading ? <Loader2 size={20} className="spin" /> : <Paperclip size={20} />}
            </button>
            
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message here..."
              disabled={isLoading || isUploading}
            />
            <button 
              type="submit" 
              className="send-btn" 
              disabled={!input.trim() || isLoading || isUploading}
            >
              <Send size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default App;
