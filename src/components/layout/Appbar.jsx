import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Kanban,
  FileText,
  CheckCircle2,
  Truck,
  LayoutDashboard,
  Smartphone,
  Search,
  LogOut
} from 'lucide-react';
import logoImg from '../../assets/logo.png';

export default function Appbar({ onOpenPalette, onLogoutClick }) {
  const { staff } = useAuth();
  const location = useLocation();
  const path = location.pathname.replace('/', '') || 'sales';

  const navItems = [
    { id: 'board', path: '/board', label: 'Board', icon: Kanban, kbd: 'B' },
    { id: 'approvals', path: '/approvals', label: 'Approvals', icon: CheckCircle2, kbd: 'A' },
    { id: 'quotations', path: '/quotations', label: 'Quotations', icon: FileText, kbd: 'Q' },
    { id: 'fleet', path: '/fleet', label: 'Fleet', icon: Truck, kbd: 'F' },
    { id: 'driver', path: '/driver', label: 'Driver App', icon: Smartphone, kbd: 'P' },
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, kbd: 'D' },
  ];

  return (
    <header className="appbar">
      <div className="in">
        <Link to="/sales" className="brand">
          <img src={logoImg} alt="Rens Dynamics" className="brand-logo" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', fontWeight: 800, color: '#10B981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', padding: '2px 8px', borderRadius: '99px', letterSpacing: '0.04em' }}>
            <span className="dot-pulse" style={{ width: '6px', height: '6px' }}></span>
            LIVE
          </span>
        </Link>
        <nav className="nav">
          {navItems.map((item) => {
            const active = path === item.id || (path === '' && item.id === 'sales');
            const IconComp = item.icon;
            return (
              <Link key={item.id} to={item.path} className={active ? 'on' : ''}>
                <span className="nav-ic" style={{ display: 'inline-flex', marginRight: '6px', alignItems: 'center' }}>
                  <IconComp size={15} strokeWidth={2.2} />
                </span>
                {item.label}
                <kbd>{item.kbd}</kbd>
              </Link>
            );
          })}
        </nav>
        <span className="spacer"></span>
        <button className="kbtn" onClick={onOpenPalette} title="Open Command Palette (Cmd/Ctrl + K or /)">
          <Search size={15} strokeWidth={2.2} style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.9 }} />
          <span>Command</span>
          <span style={{ display: 'inline-flex', gap: '2px', marginLeft: '2px' }}>
            <kbd className="dark">⌘</kbd>
            <kbd className="dark">K</kbd>
          </span>
        </button>
        <div className="who">
          <span className={`rolebadge ${staff?.role === 'owner' ? 'owner' : ''}`}>{staff?.role || 'owner'}</span>
          <span style={{ color: '#F1F5F9', fontWeight: 700 }}>{staff?.name || 'Demo Staff'}</span>
          <button className="linkact d" style={{ marginLeft: '4px', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={onLogoutClick}>
            <LogOut size={13} strokeWidth={2} />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

