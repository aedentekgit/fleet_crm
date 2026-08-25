import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeDbStatus } from '../../lib/supabase';
import {
  LayoutDashboard,
  FileText,
  CheckCircle2,
  Kanban,
  Truck,
  Smartphone,
  Search,
  ChevronLeft,
  LogOut,
  Menu,
  X,
  TrendingUp,
  Building2,
  Tag,
  BookUser,
  FileCheck,
  Receipt
} from 'lucide-react';
import logoImg from '../../assets/logo.png';

export default function Sidebar({ onOpenPalette, onLogoutClick }) {
  const { staff } = useAuth();
  const location = useLocation();
  const path = location.pathname.replace('/', '') || 'sales';
  const [mobileOpen, setMobileOpen] = useState(false);

  const [isMini, setIsMini] = useState(() => {
    try {
      return localStorage.getItem('rens_sidebar_mini') === 'true';
    } catch (e) {
      return false;
    }
  });

  const toggleMini = () => {
    setIsMini(prev => {
      const next = !prev;
      try {
        localStorage.setItem('rens_sidebar_mini', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navGroups = [
    {
      title: 'Commercial & Sales',
      items: [
        { id: 'sales', path: '/sales', label: 'Sales & Targets', icon: TrendingUp, kbd: 'S' },
        { id: 'pricing', path: '/pricing', label: 'Price Lists', icon: Tag, kbd: 'L' },
        { id: 'contacts', path: '/contacts', label: 'Contact List', icon: BookUser, kbd: 'T' },
        { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, kbd: 'D' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { id: 'customers', path: '/customers', label: 'Customers', icon: Building2, kbd: 'C' },
        { id: 'approvals', path: '/approvals', label: 'Approvals', icon: CheckCircle2, kbd: 'A' },
        { id: 'quotations', path: '/quotations', label: 'Orders', icon: FileText, kbd: 'Q' },
        { id: 'board', path: '/board', label: 'Job Board', icon: Kanban, kbd: 'B' },
        { id: 'finalize', path: '/finalize', label: 'Finalize', icon: FileCheck, kbd: 'Z' },
        { id: 'expenses-report', path: '/expenses-report', label: 'Expenses Report', icon: Receipt, kbd: 'E' },
      ],
    },
    {
      title: 'Fleet & Crew',
      items: [
        { id: 'fleet', path: '/fleet', label: 'Fleet & Assets', icon: Truck, kbd: 'F' },
        { id: 'driver', path: '/driver', label: 'Driver App (PWA)', icon: Smartphone, kbd: 'P' },
      ],
    },
  ];

  const bottomNavItems = [
    { id: 'sales', path: '/sales', label: 'Sales', icon: TrendingUp },
    { id: 'board', path: '/board', label: 'Board', icon: Kanban },
    { id: 'approvals', path: '/approvals', label: 'Approvals', icon: CheckCircle2 },
    { id: 'quotations', path: '/quotations', label: 'Orders', icon: FileText },
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const [dbStatus, setDbStatus] = useState({ connected: false, checked: false });

  useEffect(() => {
    const unsubscribe = subscribeDbStatus((status) => {
      setDbStatus(status);
    });
    return () => unsubscribe();
  }, []);

  return (
    <>
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <button
          className="mobile-toggle"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label={mobileOpen ? 'Close Navigation' : 'Open Navigation'}
        >
          {mobileOpen ? <X size={22} strokeWidth={2.4} /> : <Menu size={22} strokeWidth={2.4} />}
        </button>
        <Link to="/sales" className="mobile-brand" onClick={() => setMobileOpen(false)}>
          <img src={logoImg} alt="Rens Dynamics" className="brand-logo" />
        </Link>
        <div className="mobile-header-actions">
          <button className="mobile-search-btn" onClick={onOpenPalette} aria-label="Search">
            <Search size={18} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* Backdrop for Mobile Drawer */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside className={`sidebar ${isMini ? 'mini-sidebar' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <Link to="/sales" className="brand-link" onClick={() => setMobileOpen(false)} title="Rens Dynamics ERP">
            <img src={logoImg} alt="Rens Dynamics" className="brand-logo" />
          </Link>
          <button
            className="mini-toggle-btn"
            onClick={toggleMini}
            title={isMini ? 'Expand sidebar' : 'Collapse to mini sidebar'}
          >
            <ChevronLeft size={16} strokeWidth={2.5} style={{ transform: isMini ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }} />
          </button>
        </div>

        {/* Search Command Palette Trigger */}
        <button
          className="sidebar-search-btn"
          onClick={() => { onOpenPalette(); setMobileOpen(false); }}
          title="Search command (Cmd/Ctrl + K)"
        >
          <Search size={16} strokeWidth={2.2} style={{ opacity: 0.85, flexShrink: 0 }} />
          {!isMini && <span>Search command…</span>}
          {!isMini && (
            <span className="search-keys">
              <kbd className="dark">⌘</kbd>
              <kbd className="dark">K</kbd>
            </span>
          )}
        </button>

        {/* Navigation Sections */}
        <div className="sidebar-nav">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="nav-group">
              {!isMini && <div className="group-title">{group.title}</div>}
              <div className="group-items">
                {group.items.map((item) => {
                  const active = path === item.id || (path === '' && item.id === 'board');
                  const IconComponent = item.icon;
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      className={`nav-item-link ${active ? 'active' : ''}`}
                      onClick={() => setMobileOpen(false)}
                      title={isMini ? `${item.label} (${item.kbd})` : undefined}
                    >
                      <span className="nav-icon">
                        <IconComponent size={16} strokeWidth={2.2} />
                      </span>
                      {!isMini && <span className="nav-label">{item.label}</span>}
                      {!isMini && <kbd className={`nav-kbd ${active ? 'active' : ''}`}>{item.kbd}</kbd>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer User Card & DB Status */}
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar" title={staff?.name || 'Demo Staff'}>
              {(staff?.name || 'D').charAt(0).toUpperCase()}
            </div>
            {!isMini && (
              <div className="user-info">
                <span className="user-name">{staff?.name || 'Demo Staff'}</span>
                <span className={`user-role ${staff?.role === 'owner' ? 'owner' : ''}`}>
                  {staff?.role || 'owner'}
                </span>
              </div>
            )}
            <button className="logout-btn" onClick={onLogoutClick} title="Logout">
              <LogOut size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        {bottomNavItems.map((item) => {
          const active = path === item.id || (path === '' && item.id === 'board');
          const IconComp = item.icon;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
            >
              <div className="mobile-bottom-nav-icon">
                <IconComp size={18} strokeWidth={active ? 2.4 : 2} />
              </div>
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
