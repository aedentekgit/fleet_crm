import React, { useEffect } from 'react';

export default function ShortcutsSheet({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="overlay open" id="sheetOverlay" onClick={(e) => e.target.id === 'sheetOverlay' && onClose()}>
      <div className="sheet" role="dialog" aria-label="Shortcuts" style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '24px', padding: '28px', maxWidth: '820px', width: '100%', color: '#FFF' }}>
        <div className="sh" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Keyboard shortcuts reference</h3>
          <button className="kbtn" onClick={onClose}>Close <kbd className="dark">esc</kbd></button>
        </div>
        <div className="cheat" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          <div className="cheatcol">
            <h4 style={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8', marginBottom: '12px' }}>Navigate (G then…)</h4>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Dashboard</span>
              <span className="kk"><kbd>G</kbd><kbd>D</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Sales &amp; Invoices</span>
              <span className="kk"><kbd>G</kbd><kbd>S</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Customers CRM</span>
              <span className="kk"><kbd>G</kbd><kbd>C</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Price Lists</span>
              <span className="kk"><kbd>G</kbd><kbd>L</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Contact List</span>
              <span className="kk"><kbd>G</kbd><kbd>T</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Job Board</span>
              <span className="kk"><kbd>G</kbd><kbd>B</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Finalize</span>
              <span className="kk"><kbd>G</kbd><kbd>Z</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Expenses Report</span>
              <span className="kk"><kbd>G</kbd><kbd>E</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Orders / Quotes</span>
              <span className="kk"><kbd>G</kbd><kbd>Q</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Approvals</span>
              <span className="kk"><kbd>G</kbd><kbd>A</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Fleet &amp; Assets</span>
              <span className="kk"><kbd>G</kbd><kbd>F</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Driver PWA</span>
              <span className="kk"><kbd>G</kbd><kbd>P</kbd></span>
            </div>
          </div>
          <div className="cheatcol">
            <h4 style={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8', marginBottom: '12px' }}>Actions &amp; Grid</h4>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Move down / up</span>
              <span className="kk"><kbd>J</kbd><kbd>K</kbd> · <kbd>↓</kbd><kbd>↑</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Columns left / right</span>
              <span className="kk"><kbd>H</kbd><kbd>L</kbd> · <kbd>←</kbd><kbd>→</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Primary action / Edit</span>
              <span className="kk"><kbd>↵</kbd> <kbd>E</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Assign / Reassign</span>
              <span className="kk"><kbd>A</kbd> <kbd>R</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Start / Deliver / Cancel</span>
              <span className="kk"><kbd>S</kbd> <kbd>V</kbd> <kbd>X</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Approve / Send back</span>
              <span className="kk"><kbd className="hot">Y</kbd> <kbd>B</kbd></span>
            </div>
          </div>
          <div className="cheatcol">
            <h4 style={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', color: '#94A3B8', marginBottom: '12px' }}>Global &amp; Tabs</h4>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Command Palette</span>
              <span className="kk"><kbd>⌘</kbd><kbd>K</kbd> · <kbd>/</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Fleet tabs (1..4)</span>
              <span className="kk"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Create / New item</span>
              <span className="kk"><kbd>N</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Save draft / Submit</span>
              <span className="kk"><kbd>⌘</kbd><kbd>S</kbd> · <kbd>⌘</kbd><kbd>↵</kbd></span>
            </div>
            <div className="krow" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', marginBottom: '8px' }}>
              <span>Help / Dismiss</span>
              <span className="kk"><kbd>?</kbd> · <kbd>esc</kbd></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
