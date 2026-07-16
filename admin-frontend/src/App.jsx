import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, FileText, Send, Database, AlertCircle, CheckCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'leads' && <LeadsView />}
        {activeTab === 'knowledge' && <KnowledgeBaseView />}
      </main>
    </div>
  );
}

function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'leads', label: 'Collected Leads', icon: <Users size={20} /> },
    { id: 'knowledge', label: 'Knowledge Base', icon: <Database size={20} /> },
  ];

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Database size={28} />
        </div>
        <span className="brand-text">RT Admin</span>
      </div>
      <div className="nav-menu">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardView() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/conversations')
      .then(res => res.json())
      .then(data => {
        setConversations(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch conversations", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of chat interactions and state</p>
      </div>

      <div className="dashboard-grid">
        <div className="glass-card">
          <h3 style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>Total Conversations</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{conversations.length}</div>
        </div>
        <div className="glass-card">
          <h3 style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>Escalated to Human</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>
            {conversations.filter(c => c.escalated).length}
          </div>
        </div>
      </div>

      <div className="glass-card table-container">
        <h3>Recent Conversations</h3>
        {loading ? (
          <p style={{ marginTop: '20px', color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <table style={{ marginTop: '20px' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Messages</th>
                <th>Last Intent</th>
                <th>Status</th>
                <th>Summary</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conv, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {conv.conversation_id.substring(0, 13)}...
                  </td>
                  <td>{conv.message_count}</td>
                  <td>
                    {conv.last_intent ? (
                      <span className="badge intent">{conv.last_intent}</span>
                    ) : '-'}
                  </td>
                  <td>
                    {conv.escalated ? (
                      <span className="badge escalated">Escalated</span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)' }}>Active</span>
                    )}
                  </td>
                  <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.session_summary || 'No summary'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(conv.last_updated).toLocaleString()}
                  </td>
                </tr>
              ))}
              {conversations.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No conversations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/collected_data')
      .then(res => res.json())
      .then(data => {
        setLeads(data);
        setLoading(false);
      });
  }, []);

  const getPivotedData = () => {
    const sessionMap = {};
    const keysSet = new Set();
    
    leads.forEach(lead => {
      keysSet.add(lead.key);
      if (!sessionMap[lead.session_id]) {
        sessionMap[lead.session_id] = { session_id: lead.session_id, last_collected: lead.created_at };
      }
      sessionMap[lead.session_id][lead.key] = lead.value;
      if (new Date(lead.created_at) > new Date(sessionMap[lead.session_id].last_collected)) {
        sessionMap[lead.session_id].last_collected = lead.created_at;
      }
    });

    const columns = Array.from(keysSet).sort();
    const rows = Object.values(sessionMap).sort((a, b) => new Date(b.last_collected) - new Date(a.last_collected));
    
    return { columns, rows };
  };

  const { columns, rows } = getPivotedData();

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Collected Leads</h1>
        <p className="page-subtitle">Data gathered during lead generation flows</p>
      </div>

      <div className="glass-card table-container">
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Session ID</th>
                {columns.map(col => (
                  <th key={col}>{col.replace(/_/g, ' ')}</th>
                ))}
                <th>Last Collected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.session_id.substring(0, 13)}...</td>
                  {columns.map(col => (
                    <td key={col}>{row[col] || <span style={{color: 'var(--text-muted)'}}>-</span>}</td>
                  ))}
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(row.last_collected).toLocaleString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No collected leads found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KnowledgeBaseView() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docText, setDocText] = useState('');
  const [docMetadata, setDocMetadata] = useState('');
  const [pushing, setPushing] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchDocs = () => {
    setLoading(true);
    fetch('/api/documents')
      .then(res => res.json())
      .then(data => {
        setDocuments(data.documents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handlePush = async (e) => {
    e.preventDefault();
    if (!docText.trim()) return;
    
    setPushing(true);
    setMessage(null);
    
    try {
      let meta = {};
      if (docMetadata.trim()) {
        meta = JSON.parse(docMetadata);
      }
      
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: docText, metadata: meta })
      });
      
      if (!res.ok) throw new Error('Failed to push document');
      
      setMessage({ type: 'success', text: 'Document successfully pushed to ChromaDB!' });
      setDocText('');
      setDocMetadata('');
      fetchDocs();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error parsing metadata or pushing.' });
    } finally {
      setPushing(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      fetchDocs();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Knowledge Base</h1>
        <p className="page-subtitle">Manage documents for RAG (Retrieval-Augmented Generation)</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        <div className="glass-card" style={{ height: 'fit-content' }}>
          <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--primary-light)" />
            Add New Document
          </h3>
          
          <form onSubmit={handlePush}>
            <div className="input-group">
              <label>Document Content</label>
              <textarea 
                className="input-field" 
                rows="6" 
                placeholder="Enter FAQ or knowledge base information..."
                value={docText}
                onChange={(e) => setDocText(e.target.value)}
                required
                style={{ resize: 'vertical' }}
              />
            </div>
            
            <div className="input-group">
              <label>Metadata (JSON optional)</label>
              <textarea 
                className="input-field" 
                rows="2" 
                placeholder='{"category": "pricing", "source": "manual"}'
                value={docMetadata}
                onChange={(e) => setDocMetadata(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>
            
            {message && (
              <div style={{ 
                padding: '12px', 
                borderRadius: '8px',
                marginBottom: '20px',
                background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                {message.text}
              </div>
            )}
            
            <button type="submit" className="btn" style={{ width: '100%' }} disabled={pushing || !docText.trim()}>
              <Send size={18} />
              {pushing ? 'Pushing to DB...' : 'Push Document'}
            </button>
          </form>
        </div>

        <div className="glass-card">
          <h3 style={{ marginBottom: '24px' }}>Vector Store Documents</h3>
          {loading ? (
             <p style={{ color: 'var(--text-muted)' }}>Loading documents...</p>
          ) : documents.length === 0 ? (
             <p style={{ color: 'var(--text-muted)' }}>No documents in ChromaDB.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {documents.map((doc, idx) => (
                <div key={idx} className="doc-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div className="doc-id">ID: {doc.id}</div>
                    <button 
                      onClick={() => handleDelete(doc.id)}
                      style={{ 
                        background: 'transparent', border: 'none', color: 'var(--danger)', 
                        cursor: 'pointer', padding: '4px', borderRadius: '4px',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="doc-content">{doc.text}</div>
                  {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--glass-border)', fontSize: '0.8rem', color: 'var(--primary-light)', fontFamily: 'monospace' }}>
                      {JSON.stringify(doc.metadata)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
