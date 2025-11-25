import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, GroupByOption, GroupedData } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { exportGroupedData } from '../utils/exportUtils';

interface AggregationViewProps {
  transactions: Transaction[];
}

export const AggregationView: React.FC<AggregationViewProps> = ({ transactions }) => {
  const [groupBy, setGroupBy] = useState<GroupByOption>(GroupByOption.PARTNER_NAME);
  const [filterType, setFilterType] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [groupBy, filterType]);

  const groupedData = useMemo(() => {
    // 1. Filter first
    const filtered = transactions.filter(t => {
      if (filterType === 'ALL') return true;
      return t.type === filterType;
    });

    // 2. Group
    const groups: Record<string, GroupedData> = {};

    filtered.forEach(tx => {
      let key = '';
      switch (groupBy) {
        case GroupByOption.PARTNER_NAME:
          key = tx.partner_name || 'Không xác định';
          break;
        case GroupByOption.PARTNER_ACCOUNT:
          key = tx.partner_account || 'Không xác định';
          break;
        case GroupByOption.DATE:
          key = tx.date;
          break;
        case GroupByOption.TRANSACTION_TYPE:
          key = tx.type === 'CREDIT' ? 'Tiền vào' : 'Tiền ra';
          break;
        case GroupByOption.CATEGORY:
          key = tx.category || 'Khác';
          break;
      }

      if (!groups[key]) {
        groups[key] = {
          key,
          totalAmount: 0,
          totalCredit: 0,
          totalDebit: 0,
          count: 0,
          transactions: [],
          averageAmount: 0
        };
      }

      groups[key].totalAmount += tx.amount;
      if (tx.type === 'CREDIT') {
        groups[key].totalCredit += tx.amount;
      } else {
        groups[key].totalDebit += tx.amount;
      }
      
      groups[key].count += 1;
      groups[key].transactions.push(tx);
    });

    // 3. Convert to array and calculate average
    return Object.values(groups)
      .map(g => ({ ...g, averageAmount: g.totalAmount / g.count }))
      .sort((a, b) => b.totalAmount - a.totalAmount); // Sort by total volume descending
  }, [transactions, groupBy, filterType]);

  // Calculate Totals for the Footer
  const totalStats = useMemo(() => {
    return groupedData.reduce((acc, curr) => ({
      count: acc.count + curr.count,
      totalCredit: acc.totalCredit + curr.totalCredit,
      totalDebit: acc.totalDebit + curr.totalDebit,
      totalAmount: acc.totalAmount + curr.totalAmount,
    }), { count: 0, totalCredit: 0, totalDebit: 0, totalAmount: 0 });
  }, [groupedData]);

  const chartData = groupedData.slice(0, 10).map(g => ({
    name: g.key.length > 15 ? g.key.substring(0, 15) + '...' : g.key,
    fullKey: g.key,
    amount: g.totalAmount,
    credit: g.totalCredit,
    debit: g.totalDebit
  }));

  const getGroupByLabel = () => {
    switch (groupBy) {
      case GroupByOption.PARTNER_NAME: return 'Tên đối tác';
      case GroupByOption.PARTNER_ACCOUNT: return 'Số tài khoản';
      case GroupByOption.DATE: return 'Ngày';
      case GroupByOption.TRANSACTION_TYPE: return 'Loại GD';
      case GroupByOption.CATEGORY: return 'Danh mục';
      default: return 'Nhóm';
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN').format(val);

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const handleExpandAll = () => {
    const allKeys = new Set(groupedData.map(g => g.key));
    setExpandedGroups(allKeys);
  };

  const handleCollapseAll = () => {
    setExpandedGroups(new Set());
  };

  const isAllExpanded = groupedData.length > 0 && expandedGroups.size === groupedData.length;

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Gộp theo:</label>
          <select 
            value={groupBy} 
            onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
            className="block w-48 rounded-md border-slate-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm border bg-slate-50"
          >
            <option value={GroupByOption.PARTNER_NAME}>Tên người gửi/nhận</option>
            <option value={GroupByOption.PARTNER_ACCOUNT}>Số tài khoản</option>
            <option value={GroupByOption.CATEGORY}>Danh mục (Gợi ý)</option>
            <option value={GroupByOption.DATE}>Ngày giao dịch</option>
            <option value={GroupByOption.TRANSACTION_TYPE}>Loại giao dịch</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['ALL', 'CREDIT', 'DEBIT'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  filterType === type 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {type === 'ALL' ? 'Tất cả' : type === 'CREDIT' ? 'Tiền vào (+)' : 'Tiền ra (-)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h4 className="text-md font-semibold text-slate-800 mb-4">Top 10 theo tổng lưu chuyển (Vào + Ra)</h4>
          <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                <RechartsTooltip 
                  formatter={(value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)}
                  labelFormatter={(label, payload) => {
                    if (payload && payload.length > 0 && payload[0]?.payload?.fullKey) {
                      return `Đối tượng: ${payload[0].payload.fullKey}`;
                    }
                    return `Đối tượng: ${label}`;
                  }}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.debit > entry.credit ? '#ef4444' : '#22c55e'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">*Màu sắc biểu đồ: Xanh nếu Tiền vào nhiều hơn, Đỏ nếu Tiền ra nhiều hơn.</p>
        </div>

        {/* Stats Summary */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex flex-col justify-center space-y-4">
           <div className="bg-blue-50 p-4 rounded-lg">
             <span className="text-sm text-blue-600 block">Tổng số nhóm</span>
             <span className="text-2xl font-bold text-blue-900">{groupedData.length}</span>
           </div>
           <div className="bg-slate-50 p-4 rounded-lg">
             <span className="text-sm text-slate-600 block">Nhóm có hoạt động lớn nhất</span>
             <span className="text-2xl font-bold text-slate-900">
               {groupedData.length > 0 ? formatCurrency(groupedData[0].totalAmount) : 0} VND
             </span>
             <span className="text-xs text-slate-600 block mt-1 truncate">
               {groupedData.length > 0 ? groupedData[0].key : '-'}
             </span>
           </div>
        </div>
      </div>

      {/* Detailed Group Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-800">Chi tiết nhóm</h3>
            <p className="text-xs text-slate-500">Xem chi tiết giao dịch của từng nhóm phân loại</p>
          </div>
          
          <div className="flex items-center gap-2">
             <button 
               onClick={isAllExpanded ? handleCollapseAll : handleExpandAll}
               className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
             >
               {isAllExpanded ? 'Thu gọn tất cả' : 'Xem tất cả chi tiết'}
             </button>
             
             <button
                onClick={() => exportGroupedData(groupedData, getGroupByLabel())}
                className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors flex items-center gap-1"
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Xuất Excel
             </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-slate-700">Nhóm ({getGroupByLabel()})</th>
                <th className="px-6 py-3 text-right font-medium text-slate-700">Số GD</th>
                <th className="px-6 py-3 text-right font-medium text-green-700 bg-green-50">Tiền vào (+)</th>
                <th className="px-6 py-3 text-right font-medium text-red-700 bg-red-50">Tiền ra (-)</th>
                <th className="px-6 py-3 text-right font-medium text-slate-700">Tổng lưu chuyển</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {groupedData.map((group, idx) => (
                <React.Fragment key={idx}>
                  <tr 
                    onClick={() => toggleExpand(group.key)} 
                    className={`cursor-pointer transition-colors ${expandedGroups.has(group.key) ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
                  >
                    <td className="px-6 py-3 font-medium text-slate-900 max-w-xs truncate" title={group.key}>
                      <div className="flex items-center gap-2">
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${expandedGroups.has(group.key) ? 'rotate-90 text-blue-600' : ''}`} 
                          viewBox="0 0 20 20" 
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="truncate">{group.key}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-slate-600">{group.count}</td>
                    <td className="px-6 py-3 text-right font-medium text-green-600">
                      {group.totalCredit > 0 ? formatCurrency(group.totalCredit) : '-'}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-red-600">
                      {group.totalDebit > 0 ? formatCurrency(group.totalDebit) : '-'}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-slate-700">
                      {formatCurrency(group.totalAmount)}
                    </td>
                  </tr>
                  
                  {expandedGroups.has(group.key) && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <div className="bg-slate-50 border-y border-slate-200 p-4 animate-fade-in">
                          
                          {/* Mini Stats within expanded view */}
                          <div className="mb-4 flex gap-4 text-xs">
                             <div className="flex-1 bg-white border border-slate-200 rounded p-3 shadow-sm flex flex-col justify-center">
                                <span className="text-slate-500 mb-1">Tỷ lệ tiền vào</span>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1 overflow-hidden">
                                   <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(group.totalCredit / group.totalAmount) * 100}%` }}></div>
                                </div>
                                <span className="font-mono text-green-600">{((group.totalCredit / group.totalAmount) * 100).toFixed(1)}%</span>
                             </div>
                             <div className="flex-1 bg-white border border-slate-200 rounded p-3 shadow-sm flex flex-col justify-center">
                                <span className="text-slate-500 mb-1">Tỷ lệ tiền ra</span>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1 overflow-hidden">
                                   <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(group.totalDebit / group.totalAmount) * 100}%` }}></div>
                                </div>
                                <span className="font-mono text-red-600">{((group.totalDebit / group.totalAmount) * 100).toFixed(1)}%</span>
                             </div>
                          </div>

                          <div className="max-h-[400px] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-slate-100">
                              <thead className="bg-slate-100 sticky top-0 z-10">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-24">Ngày</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">Nội dung</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase w-24">Phân loại</th>
                                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600 uppercase w-32">Số tiền</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.transactions.map((tx, tIdx) => (
                                  <tr key={tIdx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap font-mono">{tx.date}</td>
                                    <td className="px-4 py-2 text-xs text-slate-700">{tx.description}</td>
                                    <td className="px-4 py-2 text-xs text-slate-500">
                                       <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] border border-slate-200">{tx.category || '-'}</span>
                                    </td>
                                    <td className={`px-4 py-2 text-right text-xs font-bold whitespace-nowrap ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                                      {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 border-t-2 border-slate-300 sticky bottom-0">
              <tr>
                <td className="px-6 py-4 font-bold text-slate-800">TỔNG CỘNG</td>
                <td className="px-6 py-4 text-right font-bold text-slate-800">{totalStats.count}</td>
                <td className="px-6 py-4 text-right font-bold text-green-700">
                  +{formatCurrency(totalStats.totalCredit)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-red-700">
                  -{formatCurrency(totalStats.totalDebit)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">
                  {formatCurrency(totalStats.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};