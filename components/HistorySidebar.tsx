import React from 'react';
import { SavedStatementSummary } from '../types';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  items: SavedStatementSummary[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({ isOpen, onClose, items, onSelect, onDelete }) => {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">Lịch sử đã lưu</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <p>Chưa có sao kê nào được lưu.</p>
                <p className="text-sm mt-2">Hãy tải lên và nhấn "Lưu" để xem lại sau.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow relative group">
                    <div 
                      className="cursor-pointer"
                      onClick={() => onSelect(item.id)}
                    >
                      <h3 className="font-medium text-slate-800 truncate pr-6">{item.fileName}</h3>
                      <p className="text-xs text-slate-500 mt-1">{item.bankName} • {item.transactionCount} GD</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Lưu: {new Date(item.savedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                      className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Xóa"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};