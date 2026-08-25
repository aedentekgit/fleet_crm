import React, { useEffect } from 'react';
import { AlertTriangle, AlertCircle, HelpCircle, CheckCircle2 } from 'lucide-react';

export default function ConfirmModal({ isOpen, options, onClose }) {
  if (!isOpen || !options) return null;

  const {
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'pri',
    onConfirm = () => {}
  } = options;

  let iconColor = '#EE6C1E', bgBg = 'rgba(238,108,30,0.2)';
  let IconComponent = AlertTriangle;

  if (type === 'danger') {
    iconColor = '#F87171';
    bgBg = 'rgba(248,113,113,0.2)';
    IconComponent = AlertCircle;
  } else if (type === 'warn') {
    iconColor = '#FBBF24';
    bgBg = 'rgba(251,191,36,0.2)';
    IconComponent = AlertTriangle;
  } else if (type === 'ok' || type === 'success') {
    iconColor = '#10B981';
    bgBg = 'rgba(16,185,129,0.2)';
    IconComponent = CheckCircle2;
  }

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options, onClose]);

  return (
    <div className="overlay open" style={{ zIndex: 999 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdbox confirm-modal" style={{ maxWidth: '440px', padding: '26px', textAlign: 'center', borderRadius: '24px', margin: 'auto' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: bgBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <IconComponent size={26} strokeWidth={2.3} />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '8px' }}>{title}</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--slate)', marginBottom: '22px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn gh" onClick={onClose} style={{ flex: 1, height: '42px', fontWeight: 650, background: '#F1F5F9', color: 'var(--navy-900)', borderColor: 'var(--line)' }}>
            {cancelText}
          </button>
          <button
            className={`btn ${type === 'danger' ? 'danger' : 'pri'}`}
            onClick={handleConfirm}
            style={{ flex: 1, height: '42px', fontWeight: 700, ...(type === 'danger' ? { background: '#EF4444', color: '#FFFFFF', borderColor: '#DC2626' } : {}) }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

