import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  pageSize?: number
  getRowId?: (row: T) => string
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (updater: Updater<RowSelectionState>) => void
  initialSorting?: SortingState
}

export function DataTable<T>({
  columns,
  data,
  pageSize = 15,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  initialSorting = [],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)

  const table = useReactTable({
    data,
    columns,
    state: { sorting, ...(rowSelection ? { rowSelection } : {}) },
    onSortingChange: setSorting,
    ...(onRowSelectionChange ? { onRowSelectionChange } : {}),
    ...(getRowId ? { getRowId } : {}),
    enableRowSelection: !!onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize } },
  })

  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300"
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 transition-colors hover:text-brand-600"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60',
                  row.getIsSelected() && 'bg-brand-50/60 dark:bg-brand-900/20',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            aria-label="最初のページ"
            icon={<ChevronsLeft className="size-4" />}
          />
          <Button
            variant="ghost"
            size="xs"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label="前のページ"
            icon={<ChevronLeft className="size-4" />}
          />
          <span className="px-3 text-sm text-slate-600 dark:text-slate-400">
            {pageIndex + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="xs"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            aria-label="次のページ"
            icon={<ChevronRight className="size-4" />}
          />
          <Button
            variant="ghost"
            size="xs"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(pageCount - 1)}
            aria-label="最後のページ"
            icon={<ChevronsRight className="size-4" />}
          />
        </div>
      )}
    </div>
  )
}
