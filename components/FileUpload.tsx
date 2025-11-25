import React, { useCallback } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isLoading: boolean;
  progress: number;
  processedPages?: number;
  totalPages?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isLoading, progress, processedPages, totalPages }) => {
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList && fileList.length > 0) {
      const file = fileList[0];
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/sql', 'text/plain'];
      const validExtensions = ['.pdf', '.xlsx', '.xls', '.sql'];
      
      // Simple check on extension for SQL as MIME type varies
      const isValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

      if (isValidExt) {
        onFileUpload(file);
      } else {
        alert('Vui lòng chỉ chọn file PDF, Excel (.xlsx) hoặc Backup SQL (.sql).');
      }
    }
  }, [onFileUpload]);

  return (
    <div className="w-full max-w-xl mx-auto p-6 bg-white rounded-xl shadow-md border border-slate-200">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Tải lên sao kê ngân hàng</h3>
        <p className="text-sm text-slate-500 mb-6">Hỗ trợ PDF, Excel (.xlsx) hoặc khôi phục từ SQL</p>
        
        <label className={`block w-full cursor-pointer ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="sr-only">Chọn file</span>
          <input 
            type="file" 
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2.5 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              cursor-pointer"
            accept=".pdf, .xlsx, .xls, .sql"
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </label>
        
        {isLoading && (
          <div className="mt-6 w-full text-left bg-slate-50 p-4 rounded-lg border border-slate-200">
             <div className="flex justify-between mb-2">
                <span className="text-sm font-semibold text-blue-700">
                  Đang xử lý... {totalPages && totalPages > 0 ? `(Trang ${processedPages}/${totalPages})` : ''}
                </span>
                <span className="text-sm font-medium text-slate-600">{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500 mt-2 italic">
                Hệ thống đang đọc và phân tích dữ liệu. Vui lòng không tắt trình duyệt.
              </p>
          </div>
        )}
      </div>
    </div>
  );
};