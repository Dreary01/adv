import { create } from 'zustand';

interface AuthState {
  user: any | null;
  token: string | null;
  setAuth: (user: any, token: string) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('adv_token'),
  setAuth: (user, token) => {
    localStorage.setItem('adv_token', token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('adv_token');
    set({ user: null, token: null });
  },
  isLoggedIn: () => !!get().token,
}));
