/**
 * Persists NS session data in localStorage so it survives page reloads
 * and is accessible synchronously without React state.
 *
 * Keys are scoped to the extension to avoid colliding with NS's own localStorage usage.
 */

import { DEFAULT_ITEM_ID } from "../constants/nsEnums";

const KEY_USER_ID = "ft_userId";
const KEY_DEFAULT_ITEM_ID = "ft_defaultItemId";

export interface Session {
  userId: string;
  defaultItemId: string;
}

const EMPTY_SESSION: Session = { userId: "", defaultItemId: DEFAULT_ITEM_ID };

export const SessionService = {
  get(): Session {
    const userId = window.localStorage.getItem(KEY_USER_ID);
    const defaultItemId = window.localStorage.getItem(KEY_DEFAULT_ITEM_ID);
    if (!userId) return EMPTY_SESSION;
    return { userId, defaultItemId: defaultItemId ?? DEFAULT_ITEM_ID };
  },

  set(session: Session): void {
    window.localStorage.setItem(KEY_USER_ID, session.userId);
    window.localStorage.setItem(KEY_DEFAULT_ITEM_ID, session.defaultItemId);
  },

  clear(): void {
    window.localStorage.removeItem(KEY_USER_ID);
    window.localStorage.removeItem(KEY_DEFAULT_ITEM_ID);
  },

  isInitialized(): boolean {
    return !!window.localStorage.getItem(KEY_USER_ID);
  },
};
