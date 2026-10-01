import type { NoticeMessage } from '@qafe/ui';
import { createContext, useContext } from 'react';

export const NoticeContext = createContext<(notice: NoticeMessage) => void>(() => undefined);

/** Shows a short message at the top of the screen. */
export const useNoticeContext = () => useContext(NoticeContext);
