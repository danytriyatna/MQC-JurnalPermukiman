"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BouncedLoader } from "@/components/ui/bounced-loader";

export interface DataTableColumn<TData> {
  id?: string;
  header: React.ReactNode | ((info: { data: TData[] }) => React.ReactNode);
  accessorKey?: keyof TData | string;
  cell?: (row: TData, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableFacetedFilterOption {
  label: string;
  value: string;
}

export interface DataTableFacetedFilter<TData> {
  id: string;
  title: string;
  accessorKey?: keyof TData | string;
  options: DataTableFacetedFilterOption[];
  filterFn?: (row: TData, filterValue: string) => boolean;
}

export interface DataTableProps<TData> {
  columns: DataTableColumn<TData>[];
  data: TData[];

  // Advance Search
  enableSearch?: boolean;
  searchKeys?: (keyof TData | string)[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;

  // Faceted Filters (e.g. status)
  facetedFilters?: DataTableFacetedFilter<TData>[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (filters: Record<string, string>) => void;

  // Pagination & Memory Slicing
  enablePagination?: boolean;
  defaultPageSize?: number;
  pageSizeOptions?: number[];

  // Empty & Loading States
  emptyMessage?: React.ReactNode;
  isLoading?: boolean;
  loadingMessage?: string;

  // Extra Toolbar elements (e.g. Export actions)
  toolbarExtra?: React.ReactNode;

  // Styling
  className?: string;
  tableClassName?: string;
  containerClassName?: string;
  rowClassName?: (row: TData, index: number) => string;
}

export function DataTable<TData>({
  columns,
  data,
  enableSearch = false,
  searchKeys,
  searchPlaceholder = "Cari data...",
  searchValue: controlledSearch,
  onSearchChange,
  facetedFilters,
  activeFilters: controlledFilters,
  onFilterChange,
  enablePagination = true,
  defaultPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyMessage = "Tidak ada data yang tersedia.",
  isLoading = false,
  loadingMessage = "Memuat data tabel...",
  toolbarExtra,
  className,
  tableClassName,
  containerClassName,
  rowClassName,
}: DataTableProps<TData>) {
  // Search state (internal or controlled)
  const [internalSearch, setInternalSearch] = React.useState("");
  const isSearchControlled = controlledSearch !== undefined;
  const currentSearch = isSearchControlled ? controlledSearch : internalSearch;

  const handleSearchChange = (value: string) => {
    if (!isSearchControlled) {
      setInternalSearch(value);
    }
    onSearchChange?.(value);
    setPageIndex(0); // Reset page on new search
  };

  // Filter state (internal or controlled)
  const [internalFilters, setInternalFilters] = React.useState<Record<string, string>>({});
  const isFiltersControlled = controlledFilters !== undefined;
  const currentFilters = isFiltersControlled ? controlledFilters : internalFilters;

  const handleFilterClick = (filterId: string, value: string) => {
    const nextFilters = {
      ...currentFilters,
      [filterId]: value,
    };
    if (!isFiltersControlled) {
      setInternalFilters(nextFilters);
    }
    onFilterChange?.(nextFilters);
    setPageIndex(0); // Reset page on filter switch
  };

  // Pagination state
  const [pageSize, setPageSize] = React.useState(defaultPageSize);
  const [pageIndex, setPageIndex] = React.useState(0);

  // 1. Advance Multi-Field Search (Optimized in Memory)
  const searchedData = React.useMemo(() => {
    if (!enableSearch || !currentSearch.trim()) return data;
    const q = currentSearch.toLowerCase().trim();

    return data.filter((item) => {
      if (searchKeys && searchKeys.length > 0) {
        return searchKeys.some((k) => {
          const val = (item as Record<string, unknown>)[k as string];
          return val != null && String(val).toLowerCase().includes(q);
        });
      }
      // Global fallback search across all object values
      return Object.values(item as Record<string, unknown>).some(
        (val) => val != null && String(val).toLowerCase().includes(q)
      );
    });
  }, [data, currentSearch, enableSearch, searchKeys]);

  // 2. Faceted Filters
  const filteredData = React.useMemo(() => {
    if (!facetedFilters || facetedFilters.length === 0) return searchedData;

    let result = searchedData;
    for (const filter of facetedFilters) {
      const activeValue = currentFilters[filter.id];
      if (activeValue && activeValue !== "all") {
        if (filter.filterFn) {
          result = result.filter((row) => filter.filterFn!(row, activeValue));
        } else if (filter.accessorKey) {
          result = result.filter((row) => {
            const rowVal = (row as Record<string, unknown>)[filter.accessorKey as string];
            return String(rowVal) === activeValue;
          });
        }
      }
    }
    return result;
  }, [searchedData, currentFilters, facetedFilters]);

  // 3. Memory Slicing for Pagination (O(1) DOM Nodes even for 100k+ rows)
  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);

  const paginatedData = React.useMemo(() => {
    if (!enablePagination) return filteredData;
    const start = safePageIndex * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safePageIndex, pageSize, enablePagination]);

  const startRecord = totalItems === 0 ? 0 : safePageIndex * pageSize + 1;
  const endRecord = Math.min((safePageIndex + 1) * pageSize, totalItems);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Toolbar: Search, Filters, & Extra Controls */}
      {(enableSearch || (facetedFilters && facetedFilters.length > 0) || toolbarExtra) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {enableSearch && (
              <div className="relative w-full sm:max-w-xs">
                <input
                  type="text"
                  value={currentSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label="Pencarian tabel"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm text-slate-900 placeholder:text-muted-foreground shadow-none transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {facetedFilters?.map((filter) => {
              const activeVal = currentFilters[filter.id] || "all";
              return (
                <div
                  key={filter.id}
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label={filter.title}
                >
                  {filter.options.map((opt) => {
                    const isActive = activeVal === opt.value;
                    return (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        onClick={(e) => {
                          e.preventDefault();
                          handleFilterClick(filter.id, opt.value);
                        }}
                        aria-pressed={isActive}
                        className={cn(
                          "h-8 rounded-full px-3 text-xs font-medium transition-all duration-150",
                          isActive
                            ? "shadow-sm"
                            : "bg-white text-muted-foreground hover:bg-slate-50 hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {toolbarExtra && <div className="flex items-center gap-2">{toolbarExtra}</div>}
        </div>
      )}

      {/* Main Table Container with Natural Content Fit */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
          containerClassName
        )}
      >
        {isLoading && (
          <BouncedLoader
            variant="overlay"
            message={loadingMessage}
            label="Menyaring data..."
          />
        )}

        <div className="overflow-x-auto">
          <Table className={tableClassName}>
            <TableHeader>
              <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                {columns.map((col, idx) => {
                  const headerContent =
                    typeof col.header === "function"
                      ? col.header({ data: filteredData })
                      : col.header;

                  return (
                    <TableHead
                      key={col.id || String(col.accessorKey) || idx}
                      className={cn(
                        "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                        col.headerClassName,
                        col.className
                      )}
                    >
                      {headerContent}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-28 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, rowIdx) => (
                  <TableRow
                    key={(row as { id?: string | number }).id ?? rowIdx}
                    className={cn(
                      "border-b border-slate-100 transition-colors hover:bg-slate-50/80",
                      rowClassName?.(row, rowIdx)
                    )}
                  >
                    {columns.map((col, colIdx) => {
                      let cellContent: React.ReactNode = null;
                      if (col.cell) {
                        cellContent = col.cell(row, rowIdx);
                      } else if (col.accessorKey) {
                        const rawVal = (row as Record<string, unknown>)[col.accessorKey as string];
                        cellContent = rawVal != null ? String(rawVal) : null;
                      }

                      return (
                        <TableCell
                          key={col.id || String(col.accessorKey) || colIdx}
                          className={cn("px-5 py-4", col.className)}
                        >
                          {cellContent}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination Controls */}
      {enablePagination && totalItems > 0 && (
        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <p>
              Menampilkan <span className="font-semibold text-slate-900 tabular-nums">{startRecord}</span> -{" "}
              <span className="font-semibold text-slate-900 tabular-nums">{endRecord}</span> dari{" "}
              <span className="font-semibold text-slate-900 tabular-nums">{totalItems}</span> data
            </p>

            <div className="flex items-center gap-1.5">
              <span>Per halaman:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPageIndex(0);
                }}
                className="h-7 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:border-primary focus:outline-none"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(0)}
              className="h-8 rounded-lg px-2.5 text-xs font-medium"
            >
              Pertama
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
              className="h-8 rounded-lg px-2.5 text-xs font-medium"
            >
              Sebelumnya
            </Button>

            <span className="px-2 text-xs font-medium text-slate-700">
              Halaman <span className="font-semibold tabular-nums">{safePageIndex + 1}</span> dari{" "}
              <span className="font-semibold tabular-nums">{totalPages}</span>
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
              className="h-8 rounded-lg px-2.5 text-xs font-medium"
            >
              Berikutnya
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex(totalPages - 1)}
              className="h-8 rounded-lg px-2.5 text-xs font-medium"
            >
              Terakhir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
