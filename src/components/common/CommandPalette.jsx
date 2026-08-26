import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Kanban,
  FileText,
  CheckCircle2,
  Truck,
  LayoutDashboard,
  Smartphone,
  Keyboard,
  Trash2,
  TrendingUp,
  Building2,
  Tag,
  BookUser,
  FileCheck,
  Receipt,
  Sparkles
} from 'lucide-react';
import { clearDatabaseData } from '../../lib/supabase';

export default function CommandPalette({ isOpen, onClose, extraCommands = [], onOpenShortcuts }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef(null);

  const baseCommands = [
    { icon: LayoutDashboard, t: 'Go to Dashboard', keys: ['G', 'D'], run: () => navigate('/dashboard') },
    { icon: TrendingUp, t: 'Go to Commercial Sales & Invoices', keys: ['G', 'S'], run: () => navigate('/sales') },
    { icon: Building2, t: 'Go to Customers CRM Directory', keys: ['G', 'C'], run: () => navigate('/customers') },
    { icon: Tag, t: 'Go to Customer Price Lists & Rates', keys: ['G', 'L'], run: () => navigate('/pricing') },
    { icon: BookUser, t: 'Go to Customer Contact List', keys: ['G', 'T'], run: () => navigate('/contacts') },
    { icon: Kanban, t: 'Go to Job Board', keys: ['G', 'B'], run: () => navigate('/board') },
    { icon: FileCheck, t: 'Go to Finalize Dispatch', keys: ['G', 'Z'], run: () => navigate('/finalize') },
    { icon: Receipt, t: 'Go to Expenses Report (Delivered Orders)', keys: ['G', 'E'], run: () => navigate('/expenses-report') },
    { icon: FileText, t: 'Go to Quotations & Orders', keys: ['G', 'Q'], run: () => navigate('/quotations') },
    { icon: CheckCircle2, t: 'Go to Approvals', keys: ['G', 'A'], run: () => navigate('/approvals') },
    { icon: Truck, t: 'Go to Fleet & Assets', keys: ['G', 'F'], run: () => navigate('/fleet') },
    { icon: Smartphone, t: 'Go to Driver Mobile PWA', keys: ['G', 'P'], run: () => navigate('/driver') },
    { icon: Keyboard, t: 'Show keyboard shortcuts', keys: ['?'], run: () => onOpenShortcuts && onOpenShortcuts() },
    {
      icon: Trash2,
      t: 'Clear All Data & Reset Database',
      keys: ['C', 'L', 'R'],
      run: async () => {
        if (window.confirm('Are you sure you want to completely clear and reset all database and local data?')) {
          await clearDatabaseData();
          window.location.reload();
        }
      }
    }
  ];

  const allCommands = [...baseCommands, ...extraCommands];
  const filtered = allCommands.filter((c) => c.t.toLowerCase().includes(query.toLowerCase().trim()));

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelIdx((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selIdx]) {
        onClose();
        filtered[selIdx].run();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handlePick = (cmd) => {
    onClose();
    if (cmd.run) cmd.run();
  };

  return (
    <div className="overlay open" id="cmdOverlay" onClick={(e) => e.target.id === 'cmdOverlay' && onClose()}>
      <div className="cmdbox" role="dialog" aria-label="Command palette">
        <div className="cin">
          <span className="mag" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Search size={16} strokeWidth={2.2} />
          </span>
          <input
            ref={inputRef}
            id="cmdInput"
            placeholder="Type a command…"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelIdx(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="dark">esc</kbd>
        </div>
        <div className="clist" id="cmdList">
          {filtered.length > 0 ? (
            filtered.map((c, idx) => {
              const IconComp = c.icon;
              return (
                <div
                  key={idx}
                  className={`ci ${idx === selIdx ? 'sel' : ''}`}
                  onClick={() => handlePick(c)}
                  onMouseEnter={() => setSelIdx(idx)}
                >
                  <span className="gi" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {IconComp ? <IconComp size={16} strokeWidth={2.2} /> : (c.i ? <span dangerouslySetInnerHTML={{ __html: c.i }} /> : null)}
                  </span>
                  <span>{c.t}</span>
                  <span className="kk" style={{ marginLeft: 'auto' }}>
                    {(c.keys || []).map((k, ki) => (
                      <kbd key={ki} className="dark">{k}</kbd>
                    ))}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="ci">No matching command</div>
          )}
        </div>
        <div className="cfoot">
          <span><kbd className="dark">↑</kbd><kbd className="dark">↓</kbd> move</span>
          <span><kbd className="dark">↵</kbd> run</span>
          <span><kbd className="dark">?</kbd> shortcuts</span>
        </div>
      </div>
    </div>
  );
}

