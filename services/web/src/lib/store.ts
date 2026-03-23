import { create } from 'zustand';
import { api } from './api';

interface AuthState {
  user: any | null;
  token: string | null;
  userLoaded: boolean;
  setAuth: (user: any, token: string) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('adv_token'),
  userLoaded: false,
  setAuth: (user, token) => {
    localStorage.setItem('adv_token', token);
    set({ user, token, userLoaded: true });
  },
  logout: () => {
    localStorage.removeItem('adv_token');
    set({ user: null, token: null, userLoaded: true });
  },
  isLoggedIn: () => !!get().token,
  loadUser: async () => {
    if (!get().token) { set({ userLoaded: true }); return; }
    try {
      const user = await api.me();
      set({ user, userLoaded: true });
    } catch (err: any) {
      // Only logout on auth errors, not network errors
      if (err?.message?.includes('401') || err?.message?.includes('unauthorized') || err?.message?.includes('invalid token')) {
        localStorage.removeItem('adv_token');
        set({ user: null, token: null, userLoaded: true });
      } else {
        // Network error — keep token, mark loaded
        set({ userLoaded: true });
      }
    }
  },
}));
