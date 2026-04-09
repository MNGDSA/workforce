import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getUserData,
  getWorkforceData,
  clearSession,
  login as apiLogin,
  setLogoutCallback,
  isSessionValid,
} from '../services/api';
import { clearEncryptionKey } from '../services/encryption';
import { purgeAllLocalData } from '../services/database';
import type { User, Candidate, WorkforceRecord, LoginResponse } from '../types';

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

  const sessionCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const forceLogout = useCallback(async () => {
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      candidate: null,
      workforceRecord: null,
    });
  }, []);

  useEffect(() => {
    setLogoutCallback(forceLogout);
  }, [forceLogout]);

  const loadSession = useCallback(async () => {
    try {
      const valid = await isSessionValid();
      if (!valid) {
        setState({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          candidate: null,
          workforceRecord: null,
        });
        return;
      }

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
        await clearSession();
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

  useEffect(() => {
    if (state.isAuthenticated) {
      sessionCheckInterval.current = setInterval(async () => {
        const valid = await isSessionValid();
        if (!valid) {
          forceLogout();
        }
      }, 60000);
    }
    return () => {
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }
    };
  }, [state.isAuthenticated, forceLogout]);

  const login = useCallback(async (identifier: string, password: string): Promise<LoginResponse> => {
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

  const deleteAllData = useCallback(async () => {
    await purgeAllLocalData();
    await clearEncryptionKey();
    await clearSession();
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      candidate: null,
      workforceRecord: null,
    });
  }, []);

  return { ...state, login, logout, refresh: loadSession, deleteAllData };
}
