import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('finance_token'));

  const login = async (password) => {
    const { data } = await api.post('/auth/login', { password });
    localStorage.setItem('finance_token', data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('finance_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
