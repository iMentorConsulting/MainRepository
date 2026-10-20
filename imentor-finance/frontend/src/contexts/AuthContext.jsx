import { createContext, useContext, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('finance_token'));

  // Returns null on full login, or { requires_2fa, temp_token } when 2FA is needed
  const login = async (password) => {
    const { data } = await api.post('/auth/login', { password });
    if (data.requires_2fa) return { requires_2fa: true, temp_token: data.temp_token };
    localStorage.setItem('finance_token', data.token);
    setToken(data.token);
    return null;
  };

  const verify2fa = async (temp_token, code) => {
    const { data } = await api.post('/auth/2fa/verify', { temp_token, code });
    localStorage.setItem('finance_token', data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('finance_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, verify2fa, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
