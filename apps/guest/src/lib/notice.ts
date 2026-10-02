import type { NoticeMessage } from '@qafe/ui';
import { createContext, useContext } from 'react';

export const NoticeContext = createContext<(notice: NoticeMessage) => void>(() => undefined);

/** Shows a short message at the top of the screen. */
export const useNoticeContext = () => useContext(NoticeContext);

/**
 * The message currently shown. Open panels show it too: they sit above the page, so a message
 * drawn only on the page would be hidden behind them.
 */
export const CurrentNoticeContext = createContext<NoticeMessage | null>(null);
