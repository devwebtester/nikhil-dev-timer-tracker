import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Number of screenshot cards shown per page on both dashboards.
 * 12 divides evenly into the 1, 2 and 3 column grids used by the cards,
 * so no page ends with a half-empty row.
 */
export const SCREENSHOTS_PER_PAGE = 12;

export const getTotalPages = (totalItems: number, pageSize: number) =>
  Math.max(1, Math.ceil(Math.max(0, totalItems) / Math.max(1, pageSize)));

export const clampPage = (page: number, totalPages: number) =>
  Math.min(Math.max(1, Math.floor(Number(page) || 1)), Math.max(1, totalPages));

export interface PaginationResult<T> {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  /** 1-based index of the first / last item on this page (0 when empty). */
  firstItemNumber: number;
  lastItemNumber: number;
  pageItems: T[];
  setPage: (page: number) => void;
}

/**
 * Client-side pagination over an already filtered list.
 *
 * - `resetKey` (e.g. employee id + date): when it changes the page is 1.
 * - The page is always clamped to the current page count, so a shrinking
 *   list never leaves the user on an empty page.
 * - The source list is never modified.
 */
export function usePagination<T>(
  items: T[],
  resetKey: string,
  pageSize: number = SCREENSHOTS_PER_PAGE
): PaginationResult<T> {
  const [state, setState] = useState({ page: 1, key: resetKey });

  const totalItems = items.length;
  const totalPages = getTotalPages(totalItems, pageSize);
  const requestedPage = state.key === resetKey ? state.page : 1;
  const page = clampPage(requestedPage, totalPages);

  // Commit the reset / clamped page so an old page number cannot come back
  // later if the list shrinks and then grows again.
  if (state.key !== resetKey || state.page !== page) {
    setState({ page, key: resetKey });
  }

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  const setPage = useCallback(
    (next: number) => setState({ page: next, key: resetKey }),
    [resetKey]
  );

  return {
    page,
    totalPages,
    totalItems,
    pageSize,
    firstItemNumber: totalItems === 0 ? 0 : (page - 1) * pageSize + 1,
    lastItemNumber: Math.min(page * pageSize, totalItems),
    pageItems,
    setPage,
  };
}

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  firstItemNumber: number;
  lastItemNumber: number;
  onPageChange: (page: number) => void;
  /** Optional element to scroll back to after changing page. */
  scrollAnchorRef?: React.RefObject<HTMLElement | null>;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  page,
  totalPages,
  totalItems,
  firstItemNumber,
  lastItemNumber,
  onPageChange,
  scrollAnchorRef,
}) => {
  // Nothing to navigate when everything fits on one page.
  if (totalPages <= 1) return null;

  const go = (next: number) => {
    onPageChange(clampPage(next, totalPages));
    scrollAnchorRef?.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const buttonClass =
    'cursor-pointer inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-300 dark:disabled:hover:border-slate-700';

  return (
    <nav
      aria-label="Screenshot pages"
      className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3"
    >
      <div className="text-[11px] text-slate-500 order-2 sm:order-1">
        Showing {firstItemNumber}–{lastItemNumber} of {totalItems}
      </div>

      <div className="flex items-center gap-3 order-1 sm:order-2">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className={buttonClass}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <span
          className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap"
          aria-live="polite"
        >
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          className={buttonClass}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};