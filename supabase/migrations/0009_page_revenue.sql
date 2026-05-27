-- Per-page running sales, pulled from the revenue tracker's per-page tab.
-- Lets the dashboard show "Board 1 revenue: $X · Board 2: $Y · …" by
-- summing across pages per board.

alter table public.page_board_map
  add column if not exists running_sales numeric;
