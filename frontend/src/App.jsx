import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquarePlus, MessageSquare, Paperclip, Loader2, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
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
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    // Generate a new session ID when the app loads
    setConversationId(generateUUID());
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
      const response = await fetch(`http://localhost:8000/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      const assistantMessage = { 
        role: 'assistant', 
        content: data.assistant_response 
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
      
      // If in voice mode, speak the response
      if (isVoiceMode) {
        playTTS(data.assistant_response);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error while processing your request.' 
      };
      setMessages((prev) => [...prev, errorMessage]);
      if (isVoiceMode) playTTS(errorMessage.content);
    } finally {
      setIsLoading(false);
    }
  };

  const playTTS = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`~]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    const goodVoice = englishVoices.find(v => v.name.includes('Google') || v.name.includes('Female')) || englishVoices[0] || voices[0];
    if(goodVoice) utterance.voice = goodVoice;
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
    if (isRecording) stopRecording();
    window.speechSynthesis.cancel();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob);
      };

      window.speechSynthesis.cancel(); // Stop AI speaking when user starts
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access error", err);
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(true); // visual cue until processing finishes
  };

  const processAudio = async (audioBlob) => {
    setIsLoading(true);
    setIsRecording(false);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      
      const sttResponse = await fetch('http://localhost:8000/api/voice/transcribe', {
        method: 'POST',
        body: formData
      });
      if (!sttResponse.ok) throw new Error('Transcription failed');
      const { text } = await sttResponse.json();
      
      if (!text || text.trim().length === 0) {
        setIsLoading(false);
        return;
      }
      
      const userMessage = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMessage]);
      
      const chatResponse = await fetch(`http://localhost:8000/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      
      if (!chatResponse.ok) throw new Error('Chat failed');
      const chatData = await chatResponse.json();
      
      setMessages((prev) => [...prev, { role: 'assistant', content: chatData.assistant_response }]);
      if (isVoiceMode) playTTS(chatData.assistant_response);
      
    } catch (err) {
      console.error(err);
      const errMsg = "Sorry, voice processing failed.";
      setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
      if (isVoiceMode) playTTS(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      
      // Auto-send a message with the file URL
      const fileMessage = `Here is my document: ${data.url}`;
      
      const userMessage = { role: 'user', content: fileMessage };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      const chatResponse = await fetch(`http://localhost:8000/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              className={`mic-button ${isRecording ? 'recording' : ''}`}
              disabled={isLoading}
              style={{
                width: '80px', height: '80px', borderRadius: '50%',
                backgroundColor: isRecording ? '#ef4444' : '#4f46e5',
                color: 'white', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: isRecording ? '0 0 20px rgba(239, 68, 68, 0.6)' : '0 4px 12px rgba(79, 70, 229, 0.4)',
                transition: 'all 0.3s ease'
              }}
            >
              {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
            </button>
            <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '0.9rem' }}>
              {isLoading ? "Thinking..." : isRecording ? "Tap to Stop & Send" : "Tap to Speak"}
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
