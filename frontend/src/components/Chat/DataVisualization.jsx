import React, { useState, useMemo } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import * as Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import { 
  Download, 
  Search, 
  ChevronUp, 
  ChevronDown, 
  ChevronsUpDown 
} from 'lucide-react';
const Plot = createPlotlyComponent(Plotly);

const DataFrameDisplay = ({ data }) => {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Dynamically create columns
  const columnHelper = createColumnHelper();
  const columns = useMemo(() => 
    Object.keys(data[0] || {}).map(key => 
      columnHelper.accessor(key, {
        header: () => key,
        cell: info => {
          const value = info.getValue();
          return value !== null && value !== undefined 
            ? value.toString() 
            : 'N/A';
        },
      })
    ),
    [data]
  );

  const table = useReactTable({
    data,
    columns,
    state: { 
      sorting, 
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getFilteredRowModel(),
  });

  const downloadCSV = () => {
    const headers = columns.map(col => col.header);
    const csvContent = [
      headers.join(','),
      ...table.getRowModel().rows.map(row => 
        row.getVisibleCells().map(cell => 
          `"${cell.getValue()}"`.replace(/"/g, '""')
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'data_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm">
      {/* Search and Download Controls */}
      <div className="flex justify-between p-2 bg-gray-50 items-center">
        <div className="relative flex-grow mr-2">
          <input 
            type="text" 
            placeholder="Search data..." 
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-8 pr-2 py-1 border rounded"
          />
          <Search 
            className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" 
            size={16} 
          />
        </div>
        <button 
          onClick={downloadCSV}
          className="p-1 hover:bg-gray-200 rounded"
          title="Download CSV"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Scrollable Table Container */}
      <div className="max-h-[300px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th 
                    key={header.id} 
                    className="p-2 border-b text-left cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getIsSorted() ? (
                        header.column.isSortedDesc ? (
                          <ChevronDown size={16} className="ml-1" />
                        ) : (
                          <ChevronUp size={16} className="ml-1" />
                        )
                      ) : (
                        <ChevronsUpDown size={16} className="ml-1 text-gray-300" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr 
                key={row.id} 
                className="hover:bg-gray-50 even:bg-gray-50/50"
              >
                {row.getVisibleCells().map(cell => (
                  <td 
                    key={cell.id} 
                    className="p-2 border-b"
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center p-2 bg-gray-50 text-sm">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => table.previousPage()} 
            disabled={!table.getCanPreviousPage()}
            className="disabled:opacity-50"
          >
            Previous
          </button>
          <button 
            onClick={() => table.nextPage()} 
            disabled={!table.getCanNextPage()}
            className="disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatResponseDisplay = ({ message, dataframe, visualization }) => {
  return (
    <div className="chat-response-container space-y-4">
      {/* Explanation Text */}
      {message && (
        <div className="response-explanation bg-white rounded-lg p-4 shadow-sm">
          {message}
        </div>
      )}

      {/* DataFrame Display */}
      {dataframe && dataframe.length > 0 && (
        <DataFrameDisplay data={dataframe} />
      )}

      {/* Plotly Visualization */}
      {visualization && (
        <div className="visualization-section">
          <Plot
            data={visualization.data}
            layout={visualization.layout}
            config={{ responsive: true }}
            className="w-full rounded-lg shadow-sm"
          />
        </div>
      )}
    </div>
  );
};

export default ChatResponseDisplay;