import React, { useState, useMemo, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { TransactionTable } from './components/TransactionTable';
import { AggregationView } from './components/AggregationView';
import { FilterBar } from './components/FilterBar';
import { HistorySidebar } from './components/HistorySidebar';
import { analyzePdfStatement } from './services/geminiService';
import { processExcelFile } from './utils/excelParser';
import { StatementData, AnalysisStatus, FilterCriteria, SavedStatementSummary } from './types';
import { exportRawData, exportExcelBackup } from './utils/exportUtils';
import { saveStatementToStorage, getStoredStatementsList, getStatementById, deleteStatementById } from './utils/storage.ts';
import { generateSQL, parseSQL } from './utils/sqlHelpers';

const App: React.FC = () => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [data, setData] = useState<StatementData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'GROUPED'>('DETAILS');
  const [progress, setProgress] = useState<number>(0);
  const [progressDetails, setProgressDetails] = useState<{current: number, total: number}>({current: 0, total: 0});
  const [currentFileName, setCurrentFileName] = useState<string>('');

  // History Sidebar State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<SavedStatementSummary[]>([]);

  // Filter State
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({
    keyword: '',
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: '',
    categories: []
  });

  // Load history list on mount
  useEffect(() => {
    setHistoryItems(getStoredStatementsList());
  }, []);

  // Helper function to read file as Base64 (for PDF)
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        const base64Content = base64String.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper for SQL Text read
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    try {
      setStatus(AnalysisStatus.READING_FILE);
      setErrorMsg('');
      setProgress(0);
      setProgressDetails({current: 0, total: 0});
      // Mặc định set theo tên file upload, sẽ được override nếu là SQL import thành công
      setCurrentFileName(file.name);

      const fileNameLower = file.name.toLowerCase();

      // Determine processing method based on file type
      if (fileNameLower.endsWith('.pdf')) {
        const base64Content = await readFileAsBase64(file);
        
        setStatus(AnalysisStatus.ANALYZING);
        // Call AI Service for PDF
        const result = await analyzePdfStatement(base64Content, (percent, current, total) => {
          setProgress(percent);
          if (current !== undefined && total !== undefined) {
             setProgressDetails({current, total});
          }
        });

        // Cập nhật filename nếu AI phát hiện được file gốc (tuỳ chọn), ở đây giữ nguyên file upload
        setData({ ...result, fileName: file.name });
        setStatus(AnalysisStatus.SUCCESS);
      } else if (fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')) {
         setStatus(AnalysisStatus.ANALYZING);
         // Call Excel Parser (Tự động phát hiện Backup hoặc Raw Statement bên trong)
         const result = await processExcelFile(file, (percent) => {
           setProgress(percent);
         });
         
         // Nếu parser lấy được filename từ backup metadata thì dùng, không thì dùng tên file upload
         setData({ ...result, fileName: result.fileName && result.fileName !== 'Restored_Backup.xlsx' ? result.fileName : file.name });
         setStatus(AnalysisStatus.SUCCESS);
      } else if (fileNameLower.endsWith('.sql')) {
          setStatus(AnalysisStatus.ANALYZING);
          // Parse SQL
          const content = await readFileAsText(file);
          setProgress(50);
          // Short delay to show progress
          setTimeout(() => {
            try {
              const result = parseSQL(content);
              setProgress(100);
              setData(result);
              // Quan trọng: Khôi phục tên file gốc từ dữ liệu SQL để hiển thị đồng nhất
              if (result.fileName) {
                setCurrentFileName(result.fileName);
              }
              setStatus(AnalysisStatus.SUCCESS);
            } catch (e: any) {
              setStatus(AnalysisStatus.ERROR);
              setErrorMsg(e.message);
            }
          }, 500);
      } else {
        throw new Error("Định dạng file không hỗ trợ.");
      }

    } catch (e: any) {
      console.error(e);
      setStatus(AnalysisStatus.ERROR);
      setErrorMsg(e.message || 'Lỗi không xác định.');
    }
  };

  // Handler specific for the SQL Input
  const handleSqlInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    event.target.value = ''; 
  };
  
  // Handler specific for the Excel Backup Input
  const handleExcelBackupInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    event.target.value = ''; 
  };

  const handleReset = () => {
    setData(null);
    setStatus(AnalysisStatus.IDLE);
    setErrorMsg('');
    setActiveTab('DETAILS');
    setProgress(0);
    setProgressDetails({current: 0, total: 0});
    setCurrentFileName('');
    // Reset filter
    setFilterCriteria({ keyword: '', startDate: '', endDate: '', minAmount: '', maxAmount: '', categories: [] });
  };

  const handleSave = () => {
    if (data) {
      try {
        const saved = saveStatementToStorage(data, currentFileName);
        setData(saved); // Update data with ID
        setHistoryItems(getStoredStatementsList());
        alert("Đã lưu vào bộ nhớ trình duyệt!");
      } catch (e: any) {
        alert(e.message);
      }
    }
  };

  const handleExportSQL = () => {
    if (data) {
      try {
        const dataToExport = { ...data, fileName: currentFileName };
        const sqlContent = generateSQL(dataToExport);
        const blob = new Blob([sqlContent], { type: 'application/sql' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const cleanName = (currentFileName || 'backup').replace(/\.[^/.]+$/, "");
        a.href = url;
        a.download = `${cleanName}_backup.sql`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
        alert("Lỗi khi xuất SQL.");
      }
    }
  };

  const handleExportExcelBackup = () => {
     if (data) {
        const dataToExport = { ...data, fileName: currentFileName };
        exportExcelBackup(dataToExport);
     }
  };

  const handleLoadHistory = (id: string) => {
    const savedData = getStatementById(id);
    if (savedData) {
      setData(savedData);
      setCurrentFileName(savedData.fileName || 'Saved File');
      setStatus(AnalysisStatus.SUCCESS);
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteHistory = (id: string) => {
    if (confirm("Bạn chắc chắn muốn xóa sao kê này khỏi lịch sử?")) {
      deleteStatementById(id);
      setHistoryItems(getStoredStatementsList());
    }
  };

  // Bulk Update Logic
  const handleCategoryUpdate = (filteredIndex: number, newCategory: string) => {
    if (!data) return;
    
    // 1. Tìm giao dịch trong danh sách đã lọc
    const txToUpdate = filteredTransactions[filteredIndex];
    if (!txToUpdate) return;

    // 2. Tìm index thực trong dữ liệu gốc
    const realIndex = data.transactions.findIndex(t => t === txToUpdate);

    if (realIndex !== -1) {
       let updatedTransactions = [...data.transactions];
       
       updatedTransactions[realIndex] = {
         ...updatedTransactions[realIndex],
         category: newCategory
       };

       // 3. BULK UPDATE
       const partnerKey = txToUpdate.partner_name ? txToUpdate.partner_name.trim() : '';
       const descKey = txToUpdate.description ? txToUpdate.description.trim() : '';
       
       const similarIndices: number[] = [];
       
       updatedTransactions.forEach((tx, idx) => {
         if (idx === realIndex) return; 
         if (tx.category === newCategory) return; 

         if (partnerKey && tx.partner_name && tx.partner_name.trim() === partnerKey) {
           similarIndices.push(idx);
         } 
         else if (!partnerKey && !tx.partner_name && descKey && tx.description === descKey) {
            similarIndices.push(idx);
         }
       });

       if (similarIndices.length > 0) {
         const confirmMsg = `Tìm thấy ${similarIndices.length} giao dịch khác từ "${partnerKey || descKey}".\nBạn có muốn gán tất cả thành "${newCategory}" không?`;
         if (window.confirm(confirmMsg)) {
           similarIndices.forEach(idx => {
             updatedTransactions[idx] = {
               ...updatedTransactions[idx],
               category: newCategory
             };
           });
         }
       }

       setData({
         ...data,
         transactions: updatedTransactions
       });
    }
  };

  // Advanced Filtering Logic
  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    
    return data.transactions.filter(tx => {
      // 1. Keyword
      if (filterCriteria.keyword) {
        const kw = filterCriteria.keyword.toLowerCase();
        const matchDesc = (tx.description || '').toLowerCase().includes(kw);
        const matchPartner = (tx.partner_name || '').toLowerCase().includes(kw);
        if (!matchDesc && !matchPartner) return false;
      }

      // 2. Amount Range
      if (filterCriteria.minAmount) {
        if (tx.amount < Number(filterCriteria.minAmount)) return false;
      }
      if (filterCriteria.maxAmount) {
        if (tx.amount > Number(filterCriteria.maxAmount)) return false;
      }

      // 3. Category
      if (filterCriteria.categories.length > 0) {
         if (!tx.category || !filterCriteria.categories.includes(tx.category)) return false;
      }

      // 4. Date Range
      if (filterCriteria.startDate || filterCriteria.endDate) {
         const parts = tx.date.split('/');
         if (parts.length === 3) {
            const txDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
            
            if (filterCriteria.startDate && txDateStr < filterCriteria.startDate) return false;
            if (filterCriteria.endDate && txDateStr > filterCriteria.endDate) return false;
         }
      }

      return true;
    });
  }, [data, filterCriteria]);

  const uniqueCategories = useMemo(() => {
    if (!data) return [];
    const cats = new Set(data.transactions.map(t => t.category || 'Khác'));
    return Array.from(cats).sort();
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <HistorySidebar 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        items={historyItems}
        onSelect={handleLoadHistory}
        onDelete={handleDeleteHistory}
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              S
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hidden sm:block">
              Sao Kê Thông Minh
            </h1>
            <h1 className="text-xl font-bold text-blue-600 sm:hidden">SKTM</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {/* History Button */}
            <button 
               onClick={() => setIsHistoryOpen(true)}
               className="text-slate-600 hover:text-blue-600 p-2 rounded-full hover:bg-slate-100 transition-colors relative"
               title="Lịch sử đã lưu"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
               {historyItems.length > 0 && (
                 <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
               )}
            </button>

            {data && (
              <>
                <button 
                  onClick={handleSave}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-md transition-colors flex items-center shadow-sm"
                  title="Lưu vào trình duyệt"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span className="hidden sm:inline">Lưu</span>
                </button>

                {/* SQL Export */}
                <button 
                  onClick={handleExportSQL}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-md transition-colors flex items-center shadow-sm"
                  title="Xuất file SQL để lưu trữ (Backup)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  <span className="hidden sm:inline">SQL</span>
                </button>

                {/* Excel Backup */}
                <button 
                  onClick={handleExportExcelBackup}
                  className="text-sm bg-teal-600 hover:bg-teal-700 text-white font-medium px-3 py-1.5 rounded-md transition-colors flex items-center shadow-sm"
                  title="Xuất file Excel Backup để lưu trữ (Đầy đủ dữ liệu)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="hidden sm:inline">Excel Backup</span>
                </button>

                {/* Excel Report */}
                <button
                  onClick={() => exportRawData(data)}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-md transition-colors flex items-center shadow-sm"
                  title="Xuất ra Excel (Báo cáo)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">Báo cáo</span>
                </button>

                <button 
                  onClick={handleReset}
                  className="text-sm text-slate-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors border border-slate-200"
                >
                  Tải lại
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* State: IDLE or LOADING or ERROR */}
        {!data && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-2xl text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-800 mb-4">Phân tích dòng tiền của bạn</h2>
              <p className="text-slate-600 text-lg">
                Tải lên file PDF sao kê ngân hàng hoặc Excel. Hệ thống sẽ tự động trích xuất và phân loại giao dịch.
              </p>
            </div>

            <FileUpload 
              onFileUpload={handleFileUpload} 
              isLoading={status === AnalysisStatus.READING_FILE || status === AnalysisStatus.ANALYZING} 
              progress={progress}
              processedPages={progressDetails.current}
              totalPages={progressDetails.total}
            />

            {/* Quick Access Restore Buttons */}
            {status === AnalysisStatus.IDLE && (
               <div className="mt-8 flex flex-col items-center w-full max-w-2xl animate-fade-in">
                  <div className="relative flex py-5 items-center w-full">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Khôi phục bản sao lưu</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                    
                    {/* SQL Import */}
                    <div className="relative group flex-1">
                        <label className="cursor-pointer flex items-center justify-center space-x-2 px-5 py-3 border border-indigo-200 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm w-full h-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                        <span className="font-medium text-sm">Nhập file Backup SQL</span>
                        <input 
                            type="file" 
                            className="hidden" 
                            accept=".sql" 
                            onChange={handleSqlInputChange} 
                        />
                        </label>
                    </div>

                    {/* Excel Backup Import */}
                    <div className="relative group flex-1">
                        <label className="cursor-pointer flex items-center justify-center space-x-2 px-5 py-3 border border-teal-200 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors shadow-sm w-full h-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="font-medium text-sm">Nhập file Excel Backup</span>
                        <input 
                            type="file" 
                            className="hidden" 
                            accept=".xlsx" 
                            onChange={handleExcelBackupInputChange} 
                        />
                        </label>
                        {/* Tooltip for Excel Backup */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none text-center">
                            Dùng file Excel Backup (FullBackup.xlsx) đã xuất trước đó để khôi phục toàn bộ dữ liệu.
                            <div className="absolute top-full left-1/2 -ml-2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                    </div>

                  </div>
               </div>
            )}

            {status === AnalysisStatus.ERROR && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center max-w-xl w-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}
            
            {/* Quick Access History if exists */}
            {historyItems.length > 0 && status === AnalysisStatus.IDLE && (
              <div className="mt-12 w-full max-w-xl">
                <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3 text-center">Mở lại gần đây</h3>
                <div className="grid grid-cols-1 gap-3">
                   {historyItems.slice(0, 3).map(item => (
                     <button 
                       key={item.id}
                       onClick={() => handleLoadHistory(item.id)}
                       className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all text-left group"
                     >
                        <div>
                          <span className="font-medium text-slate-800">{item.fileName}</span>
                          <div className="text-xs text-slate-500 mt-1">{item.bankName} • {new Date(item.savedAt).toLocaleDateString('vi-VN')}</div>
                        </div>
                        <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                          Mở &rarr;
                        </span>
                     </button>
                   ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* State: SUCCESS (Dashboard) */}
        {data && (
          <div className="animate-fade-in">
            {/* Summary Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    {data.bankName || 'Tổng hợp Sao kê'}
                  </h2>
                  <p className="text-slate-500 mt-1">
                    Chủ tài khoản: <span className="font-semibold text-slate-700">{data.accountHolder || 'Chưa xác định'}</span> 
                    {data.period && <span className="mx-2">•</span>}
                    {data.period && <span>{data.period}</span>}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Tổng GD</p>
                    <p className="text-xl font-bold text-slate-900">{filteredTransactions.length} <span className="text-sm text-slate-400 font-normal">/ {data.transactions.length}</span></p>
                  </div>
                  <div className="w-px h-10 bg-slate-200"></div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Tiền vào</p>
                    <p className="text-xl font-bold text-green-600">
                      +{new Intl.NumberFormat('vi-VN', { notation: "compact", compactDisplay: "short" }).format(
                        filteredTransactions.filter(t => t.type === 'CREDIT').reduce((sum, t) => sum + t.amount, 0)
                      )}
                    </p>
                  </div>
                  <div className="w-px h-10 bg-slate-200"></div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Tiền ra</p>
                    <p className="text-xl font-bold text-red-600">
                      -{new Intl.NumberFormat('vi-VN', { notation: "compact", compactDisplay: "short" }).format(
                        filteredTransactions.filter(t => t.type === 'DEBIT').reduce((sum, t) => sum + t.amount, 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Filter Bar */}
            <FilterBar 
              criteria={filterCriteria} 
              onCriteriaChange={setFilterCriteria} 
              availableCategories={uniqueCategories}
            />

            {/* Tabs */}
            <div className="mb-6 border-b border-slate-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('DETAILS')}
                  className={`${
                    activeTab === 'DETAILS'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Chi tiết giao dịch ({filteredTransactions.length})
                </button>
                <button
                  onClick={() => setActiveTab('GROUPED')}
                  className={`${
                    activeTab === 'GROUPED'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Phân tích & Gộp nhóm
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
              {activeTab === 'DETAILS' ? (
                <TransactionTable 
                  transactions={filteredTransactions} 
                  onCategoryChange={handleCategoryUpdate}
                />
              ) : (
                <AggregationView transactions={filteredTransactions} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;