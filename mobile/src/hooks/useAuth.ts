import { useState, useEffect, useCallback } from 'react';
import {
  getUserData,
  getWorkforceData,
  clearSession,
  login as apiLogin,
} from '../services/api';
import type { User, Candidate, WorkforceRecord } from '../types';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  candidate: Candidate | null;
  workforceRecord: WorkforceRecord | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    candidate: null,
    workforceRecord: null,
  });

  const loadSession = useCallback(async () => {
    try {
      const userData = await getUserData();
      const wfData = await getWorkforceData();

      if (userData?.user) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: userData.user,
          candidate: userData.candidate,
          workforceRecord: wfData,
        });
      } else {
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          candidate: null,
          workforceRecord: null,
        });
      }
    } catch {
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        candidate: null,
        workforceRecord: null,
      });
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await apiLogin(identifier, password);
    const wfData = await getWorkforceData();
    setState({
      isLoading: false,
      isAuthenticated: true,
      user: result.user,
      candidate: result.candidate,
      workforceRecord: wfData,
    });
    return result;
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      candidate: null,
      workforceRecord: null,
    });
  }, []);

  return { ...state, login, logout, refresh: loadSession };
}
