import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Truck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  KeyRound
} from 'lucide-react';
import logoImg from '../assets/logo.png';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState('Dynamic');
  const [password, setPassword] = useState('12345');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await login(username, password);
      if (res.success) {
        toast(`Welcome back, ${res.user.name}!`, 'ok');
        navigate('/sales');
      } else {
        setError(res.error || 'Invalid credentials. Password is 12345');
        toast(res.error || 'Login failed. Please check credentials.', 'err');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      toast('Login failed. Please try again.', 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = (demoUser = 'Dynamic') => {
    setUsername(demoUser);
    setPassword('12345');
    setError('');
  };

  return (
    <div className="login-wrapper">
      {/* Dynamic background lighting */}
      <div className="login-bg-glow glow-1" />
      <div className="login-bg-glow glow-2" />
      <div className="login-bg-grid" />

      <div className="login-container">
        {/* Top Header / Branding */}
        <div className="login-brand-header">
          <div className="login-logo-wrap">
            <img src={logoImg} alt="Rens Dynamics" className="login-brand-logo" />
          </div>
          <h1 className="login-title">Admin Sign In</h1>
        </div>

        {/* Login Card */}
        <div className="login-card">
          {error && (
            <div className="login-alert danger">
              <AlertCircle size={18} strokeWidth={2.4} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            {/* Username Input */}
            <div className="login-field">
              <label htmlFor="login-username" className="login-label">
                <span>Username (Dynamic)</span>
                <span className="login-label-hint">Any staff / admin name</span>
              </label>
              <div className="login-input-wrap">
                <div className="login-input-icon">
                  <User size={18} strokeWidth={2.2} />
                </div>
                <input
                  id="login-username"
                  type="text"
                  className="login-input"
                  placeholder="Enter username (e.g. Dynamic, Admin, Uthaya)"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError('');
                  }}
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="login-field">
              <label htmlFor="login-password" className="login-label">
                <span>Password</span>
                <span className="login-label-hint">Default: 12345</span>
              </label>
              <div className="login-input-wrap">
                <div className="login-input-icon">
                  <Lock size={18} strokeWidth={2.2} />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Enter password (12345)"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

           

            {/* Submit Button */}
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="login-spinner" />
                  <span>Signing In…</span>
                </>
              ) : (
                <>
                  <span>Sign In to ERP</span>
                  <ArrowRight size={18} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          <div className="login-card-divider">
            <span>OR</span>
          </div>

          {/* Quick link to Driver App */}
          <div className="login-driver-link-box">
            <div className="driver-link-left">
              <div className="driver-ic-wrap">
                <Truck size={20} strokeWidth={2.2} />
              </div>
              <div className="driver-text">
                <div className="driver-link-title">Field Driver?</div>
                <div className="driver-link-sub">Access mobile ePOD & job dispatch portal</div>
              </div>
            </div>
            <Link to="/driver" className="driver-link-btn">
              <span>Driver App</span>
              <ArrowRight size={15} strokeWidth={2.4} />
            </Link>
          </div>
        </div>

      
      </div>
    </div>
  );
}
