import React from 'react';
import { FilterCriteria } from '../types';

interface FilterBarProps {
  criteria: FilterCriteria;
  onCriteriaChange: (c: FilterCriteria) => void;
  availableCategories: string[];
}

export const FilterBar: React.FC<FilterBarProps> = ({ criteria, onCriteriaChange, availableCategories }) => {
  
  const handleChange = (field: keyof FilterCriteria, value: any) => {
    onCriteriaChange({
      ...criteria,
      [field]: value
    });
  };

  const handleCategoryToggle = (cat: string) => {
    const current = criteria.categories;
    if (current.includes(cat)) {
      handleChange('categories', current.filter(c => c !== cat));
    } else {
      handleChange('categories', [...current, cat]);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
      <div className="flex items-center justify-between mb-3">
         <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Bộ lọc nâng cao
         </h3>
         <button 
           onClick={() => onCriteriaChange({ keyword: '', startDate: '', endDate: '', minAmount: '', maxAmount: '', categories: [] })}
           className="text-xs text-blue-600 hover:underline"
         >
           Xóa bộ lọc
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tìm kiếm */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Từ khóa (Nội dung, Đối tác)</label>
          <div className="relative">
            <input 
              type="text"
              value={criteria.keyword}
              onChange={(e) => handleChange('keyword', e.target.value)}
              placeholder="Nhập tên, nội dung..."
              className="block w-full rounded-md border-slate-300 pl-9 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 border"
            />
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
               <svg className="h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
             </div>
          </div>
        </div>

        {/* Ngày tháng */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Khoảng thời gian</label>
          <div className="flex gap-2">
            <input 
              type="date"
              value={criteria.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-xs py-2 border px-2"
            />
            <input 
              type="date"
              value={criteria.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-xs py-2 border px-2"
            />
          </div>
        </div>

        {/* Số tiền */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Khoảng tiền (VND)</label>
          <div className="flex gap-2 items-center">
            <input 
              type="number"
              placeholder="Min"
              value={criteria.minAmount}
              onChange={(e) => handleChange('minAmount', e.target.value)}
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-xs py-2 border px-2"
            />
            <span className="text-slate-400">-</span>
            <input 
              type="number"
              placeholder="Max"
              value={criteria.maxAmount}
              onChange={(e) => handleChange('maxAmount', e.target.value)}
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-xs py-2 border px-2"
            />
          </div>
        </div>
      </div>

      {/* Categories Tags */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-500 mb-2">Lọc theo danh mục</label>
        <div className="flex flex-wrap gap-2">
          {availableCategories.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryToggle(cat)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                ${criteria.categories.includes(cat) 
                  ? 'bg-blue-100 text-blue-800 border-blue-200' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }
              `}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};