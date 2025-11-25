import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction } from '../types';

interface TransactionTableProps {
  transactions: Transaction[];
  onCategoryChange?: (index: number, newCategory: string) => void;
}

const DEFAULT_CATEGORIES = [
  "Ăn uống",
  "Mua sắm",
  "Di chuyển",
  "Điện/Nước/Net",
  "Nhà cửa",
  "Lương/Thưởng",
  "Chuyển tiền",
  "Giải trí",
  "Sức khỏe",
  "Giáo dục",
  "Đầu tư",
  "Trả nợ",
  "Phí ngân hàng",
  "Khác"
];

export const TransactionTable: React.FC<TransactionTableProps> = ({ transactions, onCategoryChange }) => {
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom');
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Tạo danh sách category động: Mặc định + Các category lạ có trong dữ liệu
  const availableCategories = useMemo(() => {
    const currentCats = new Set(DEFAULT_CATEGORIES);
    transactions.forEach(tx => {
      if (tx.category && tx.category.trim() !== '') {
        currentCats.add(tx.category);
      }
    });
    return Array.from(currentCats).sort();
  }, [transactions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeRow !== null) {
        // Handled via Backdrop
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeRow]);

  const handleCategoryClick = (index: number) => {
    if (activeRow === index) {
      setActiveRow(null);
    } else {
      // Check position to flip dropdown if near bottom of screen
      const rect = buttonRefs.current[index]?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        setDropdownPosition(spaceBelow < 250 ? 'top' : 'bottom');
      }
      setActiveRow(index);
    }
  };

  const handleSelectCategory = (index: number, category: string) => {
    if (onCategoryChange) {
      onCategoryChange(index, category);
    }
    setActiveRow(null);
  };

  return (
    <>
      {/* Backdrop for closing dropdown */}
      {activeRow !== null && (
        <div 
          className="fixed inset-0 z-10 cursor-default" 
          onClick={() => setActiveRow(null)}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm min-h-[400px]">
        <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 sticky top-0 z-0">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700 whitespace-nowrap w-24">Ngày</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 whitespace-nowrap w-24">Mã GD</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 w-48">Đối tác</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 w-40">Phân loại</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 min-w-[200px]">Nội dung</th>
              <th className="px-4 py-3 text-right font-medium text-slate-700 whitespace-nowrap w-32">Số tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {transactions.map((tx, index) => (
              <tr key={index} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-top">{tx.date}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-mono align-top pt-3.5" title={tx.transaction_code}>{tx.transaction_code ? tx.transaction_code.slice(0,12) + (tx.transaction_code.length > 12 ? '...' : '') : '-'}</td>
                <td className="px-4 py-3 text-slate-800 font-medium align-top">
                  <div className="break-words line-clamp-2" title={tx.partner_name}>{tx.partner_name || 'Không xác định'}</div>
                  {tx.partner_account && <div className="text-xs text-slate-500 font-mono mt-1">{tx.partner_account}</div>}
                </td>
                <td className="px-4 py-3 relative align-top">
                  <button
                    ref={(el) => { buttonRefs.current[index] = el; }}
                    onClick={() => handleCategoryClick(index)}
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border transition-all w-full justify-between group
                      ${tx.category && tx.category !== 'Khác'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300' 
                        : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 border-dashed'
                      }
                    `}
                    title="Nhấn để thay đổi"
                  >
                    <span className="truncate max-w-[100px]">{tx.category || '+ Gán loại'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {activeRow === index && (
                    <div 
                      className={`absolute left-0 z-20 w-56 bg-white rounded-md shadow-xl border border-slate-200 py-1 overflow-auto max-h-60
                        ${dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}
                      `}
                    >
                      <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                        Chọn danh mục
                      </div>
                      {availableCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => handleSelectCategory(index, cat)}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors
                            ${tx.category === cat ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}
                          `}
                        >
                          {cat}
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1 pt-1 sticky bottom-0 bg-white">
                        <button
                           onClick={() => {
                             const custom = prompt("Nhập tên phân loại mới:", tx.category || "");
                             if (custom && custom.trim()) handleSelectCategory(index, custom.trim());
                           }}
                           className="flex items-center w-full text-left px-4 py-3 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-medium"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Thêm loại mới...
                        </button>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 align-top">
                  <div className="line-clamp-2 text-xs" title={tx.description}>{tx.description}</div>
                </td>
                <td className={`px-4 py-3 text-right font-bold whitespace-nowrap align-top ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'CREDIT' ? '+' : '-'}{new Intl.NumberFormat('vi-VN').format(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
             </svg>
             <p>Không tìm thấy giao dịch phù hợp.</p>
          </div>
        )}
      </div>
    </>
  );
};