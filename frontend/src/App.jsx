import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquarePlus, MessageSquare, Paperclip, Loader2 } from 'lucide-react';
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
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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
      const response = await fetch(`/api/chat/${conversationId}/message`, {
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
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error while processing your request.' 
      };
      setMessages((prev) => [...prev, errorMessage]);
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
      const response = await fetch('/api/upload', {
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

      const chatResponse = await fetch(`/api/chat/${conversationId}/message`, {
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
        <button className="new-chat-btn" onClick={handleNewChat}>
          <MessageSquarePlus size={18} />
          New Chat
        </button>
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
      </div>
    </div>
  );
}

export default App;
