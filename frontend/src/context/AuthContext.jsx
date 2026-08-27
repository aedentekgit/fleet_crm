import React, { createContext, useContext, useState, useEffect } from 'react';
import { sb } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    try {
      const stored = localStorage.getItem('rens_staff') || sessionStorage.getItem('rens_staff');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

  const logout = () => {
    try {
      localStorage.removeItem('rens_staff');
      sessionStorage.removeItem('rens_staff');
    } catch (e) {
      console.error('Logout storage error:', e);
    }
    setStaff(null);
  };

  const login = async (username, password) => {
    const trimmedUser = (username || '').trim();
    const trimmedPass = (password || '').trim();

    if (!trimmedUser) {
      return { success: false, error: 'Please enter a username.' };
    }

    if (!trimmedPass) {
      return { success: false, error: 'Please enter a password.' };
    }

    // Default universal admin password is 12345
    let isValid = (trimmedPass === '12345');
    let dbStaff = null;

    if (sb) {
      try {
        const { data, error } = await sb
          .from('staff')
          .select('id,name,role,pin')
          .ilike('name', trimmedUser)
          .maybeSingle();

        if (data && !error) {
          if (data.pin && data.pin === trimmedPass) {
            isValid = true;
            dbStaff = data;
          }
        }
      } catch (e) {
        // Fall back to universal validation
      }
    }

    if (isValid) {
      const user = dbStaff ? {
        id: dbStaff.id,
        name: dbStaff.name || trimmedUser,
        role: dbStaff.role || 'owner',
        username: trimmedUser
      } : {
        id: `staff-${trimmedUser.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'user'}`,
        name: trimmedUser,
        username: trimmedUser,
        role: 'owner'
      };

      try {
        localStorage.setItem('rens_staff', JSON.stringify(user));
        sessionStorage.setItem('rens_staff', JSON.stringify(user));
      } catch (e) {}

      setStaff(user);
      return { success: true, user };
    }

    return { success: false, error: 'Invalid password. Hint: 12345' };
  };

  const loginWithPin = async (pin) => {
    if (!pin) {
      return null;
    }
    const trimmedPin = String(pin).trim();
    if (trimmedPin === '12345') {
      const user = { id: 'staff-dynamic', name: 'Dynamic', role: 'owner' };
      try {
        localStorage.setItem('rens_staff', JSON.stringify(user));
        sessionStorage.setItem('rens_staff', JSON.stringify(user));
      } catch (e) {}
      setStaff(user);
      return user;
    }

    try {
      if (sb) {
        const { data, error } = await sb
          .from('staff')
          .select('id,name,role')
          .eq('pin', trimmedPin)
          .eq('active', true)
          .maybeSingle();

        if (data && !error) {
          localStorage.setItem('rens_staff', JSON.stringify(data));
          sessionStorage.setItem('rens_staff', JSON.stringify(data));
          setStaff(data);
          return data;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ staff, isAuthenticated: !!staff, login, logout, loginWithPin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
