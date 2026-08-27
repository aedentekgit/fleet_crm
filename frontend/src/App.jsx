import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import Sidebar from './components/layout/Sidebar';
import CommandPalette from './components/common/CommandPalette';
import ShortcutsSheet from './components/common/ShortcutsSheet';
import ConfirmModal from './components/common/ConfirmModal';

import Login from './pages/Login';
import JobBoard from './pages/JobBoard';
import Quotations from './pages/Quotations';
import Approvals from './pages/Approvals';
import FleetOffice from './pages/FleetOffice';
import Dashboard from './pages/Dashboard';
import DriverApp from './pages/DriverApp';
import Customers from './pages/Customers';
import CustomerPricing from './pages/CustomerPricing';
import Sales from './pages/Sales';
import ContactList from './pages/ContactList';
import Finalize from './pages/Finalize';
import ExpensesReport from './pages/ExpensesReport';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { staff, logout } = useAuth();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [confirmOptions, setConfirmOptions] = useState(null);

  const isLoginPage = location.pathname === '/login';
  const isDriverPage = location.pathname === '/driver';

  // Global Keyboard Shortcuts Listener (G+key navigation, Cmd+K, /, ?)
  useEffect(() => {
    // Only listen for navigation shortcuts when authenticated and not on login/driver pages
    if (!staff || isLoginPage || isDriverPage) return;

    let seqBuf = '';
    let seqTimer = null;

    const handleKeyDown = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        // Prevent default browser Save Webpage dialog
        e.preventDefault();
      }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        setIsPaletteOpen(true);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        setIsShortcutsOpen(false);
        return;
      }

      // G-then-letter navigation
      if (e.key.toLowerCase() === 'g') {
        seqBuf = 'g';
        clearTimeout(seqTimer);
        seqTimer = setTimeout(() => {
          seqBuf = '';
        }, 900);
        return;
      }
      if (seqBuf === 'g') {
        seqBuf = '';
        const dests = {
          b: '/board',
          q: '/quotations',
          a: '/approvals',
          f: '/fleet',
          d: '/dashboard',
          p: '/driver',
          c: '/customers',
          l: '/pricing',
          s: '/sales',
          t: '/contacts',
          z: '/finalize',
          e: '/expenses-report',
        };
        const dest = dests[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, staff, isLoginPage, isDriverPage]);

  const handleLogoutPrompt = () => {
    setConfirmOptions({
      title: 'Logout of Rens ERP?',
      message: 'Are you sure you want to sign out of your current staff session?',
      confirmText: 'Sign Out',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => {
        logout();
        navigate('/login');
      },
    });
  };

  const showShell = staff && !isDriverPage && !isLoginPage;

  return (
    <div className={showShell ? 'app-shell' : ''}>
      {showShell && (
        <Sidebar
          onOpenPalette={() => setIsPaletteOpen(true)}
          onLogoutClick={handleLogoutPrompt}
        />
      )}

      <div className={showShell ? 'app-main-content' : ''}>
        <Routes>
          {/* Public / Auth routes */}
          <Route
            path="/login"
            element={staff ? <Navigate to="/sales" replace /> : <Login />}
          />
          <Route
            path="/driver"
            element={<DriverApp onRequestConfirm={(opts) => setConfirmOptions(opts)} />}
          />

          {/* Protected routes */}
          <Route
            path="/"
            element={<Navigate to={staff ? '/sales' : '/login'} replace />}
          />
          <Route
            path="/board"
            element={
              staff ? (
                <JobBoard onRequestConfirm={(opts) => setConfirmOptions(opts)} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/finalize"
            element={
              staff ? (
                <Finalize onRequestConfirm={(opts) => setConfirmOptions(opts)} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/expenses-report"
            element={staff ? <ExpensesReport /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/expenses"
            element={<Navigate to="/expenses-report" replace />}
          />
          <Route
            path="/quotations"
            element={staff ? <Quotations /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/approvals"
            element={staff ? <Approvals /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/fleet"
            element={staff ? <FleetOffice /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/dashboard"
            element={staff ? <Dashboard /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/customers"
            element={staff ? <Customers /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/pricing"
            element={staff ? <CustomerPricing /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/contacts"
            element={staff ? <ContactList /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/sales"
            element={staff ? <Sales /> : <Navigate to="/login" replace />}
          />
          <Route
            path="*"
            element={<Navigate to={staff ? '/sales' : '/login'} replace />}
          />
        </Routes>
      </div>

      {showShell && (
        <>
          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={() => setIsPaletteOpen(false)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />

          <ShortcutsSheet
            isOpen={isShortcutsOpen}
            onClose={() => setIsShortcutsOpen(false)}
          />
        </>
      )}

      <ConfirmModal
        isOpen={!!confirmOptions}
        options={confirmOptions}
        onClose={() => setConfirmOptions(null)}
      />
    </div>
  );
}

export default function App() {
  const isStaging = typeof window !== 'undefined' && window.location.pathname.startsWith('/staging');
  return (
    <AuthProvider>
      <ToastProvider>
        <Router basename={isStaging ? '/staging' : '/'} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppContent />
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}
