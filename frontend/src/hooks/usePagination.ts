import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 5;

/**
 * 清單分頁（在前端切）。
 * 資料量到數百筆都很順；真的成長到數千筆再改成後端 limit/offset。
 */
export function usePagination<T>(items: T[], size: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / size));

  // 刪到目前這頁沒東西時（例如刪光最後一頁），自動退回最後一頁
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => items.slice((page - 1) * size, page * size), [items, page, size]);

  return { page, setPage, pageCount, paged, total: items.length };
}
