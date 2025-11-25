import { read, utils } from 'xlsx';
import { Transaction, StatementData } from '../types';
import { normalizeCategories } from '../services/geminiService';

/**
 * Hàm làm sạch tên đối tác từ nội dung giao dịch (Phiên bản Regex thuần, không dùng AI)
 * Tái tạo logic của AI prompt để xử lý file Excel nhanh chóng.
 * 
 * @param desc Nội dung giao dịch
 * @param type Loại giao dịch ('CREDIT' = Tiền vào, 'DEBIT' = Tiền ra)
 */
const extractPartnerName = (desc: string, type: 'CREDIT' | 'DEBIT'): string => {
  if (!desc) return '';
  
  // Normalize: Chuyển về chữ hoa và loại bỏ dấu tiếng Việt để so sánh keyword dễ hơn
  // Tuy nhiên ta vẫn giữ chuỗi gốc clean để lấy tên có dấu nếu có
  let clean = desc.toUpperCase();
  const normalizedSearch = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 0. Clean initial noise (Dãy số đầu câu, ví dụ: "123456 CHUYEN KHOAN")
  clean = clean.replace(/^[\d\-\.\:\s]+/, '');

  // 1. Xác định danh sách từ khóa (Bao gồm cả có dấu và không dấu)
  let strictPrefixes: string[] = [];
  
  if (type === 'CREDIT') {
    // Tiền vào: Ưu tiên TỪ
    strictPrefixes = [
      'NHAN TU', 'TU:', 'TU ', 'REMITTER', 'FROM', 'NGUOI CHUYEN', 'SENDER', 'CHUYEN TU'
    ];
  } else {
    // Tiền ra: Ưu tiên TỚI, ĐẾN
    strictPrefixes = [
      'CHUYEN KHOAN CHO', 'CHUYEN KHOAN TOI', 'CHUYEN SANG', 'CHUYEN TIEN CHO', 'CHUYEN TIEN TOI', 
      'TOI:', 'TOI ', 'TO:', 'TO ', 'DEN:', 'DEN ', 'THU HUONG', 'BENEFICIARY', 'NGUOI NHAN', 'CHO:'
    ];
  }

  // Từ khóa chung 
  const commonPrefixes = [
      'MBVCB', 'IBFT', 'CK', 'TRICH NO', 'GIAO DICH', 'PHI', 'INTERNET BANKING', 
      'BNK', 'PAYMENT', 'SP', 'GD', 'CHUYEN KHOAN', 'CHUYEN TIEN', 'THANH TOAN', 'TRA TIEN', 'NAP TIEN', 'RUT TIEN'
  ];

  // Logic tìm kiếm:
  // Bước 1: Thử tìm bằng Strict Prefixes trước (để giải quyết vụ có cả "TỪ" và "TỚI")
  strictPrefixes.sort((a, b) => b.length - a.length);
  
  let foundStrict = false;
  // Dùng normalizedSearch để tìm vị trí keyword, nhưng cắt string từ clean (để giữ dấu nếu có)
  for (const p of strictPrefixes) {
    // Regex tìm từ khóa trong chuỗi không dấu
    const regex = new RegExp(`${p}[\\s\\:\\.\\-\\;]+`);
    const match = normalizedSearch.match(regex);
    
    if (match && match.index !== undefined) {
      // Cắt từ vị trí kết thúc match trong chuỗi gốc
      const endIdx = match.index + match[0].length;
      clean = clean.substring(endIdx);
      foundStrict = true;
      break;
    }
  }

  // Bước 2: Nếu không thấy strict, thử common prefixes
  if (!foundStrict) {
    commonPrefixes.sort((a, b) => b.length - a.length);
    for (const p of commonPrefixes) {
      const regex = new RegExp(`^${p}[\\s\\:\\.\\-\\;]+`);
      // Check trên chuỗi không dấu
      if (regex.test(normalizedSearch)) {
        // Remove prefix khỏi clean string
        const match = normalizedSearch.match(regex);
        if (match) {
            clean = clean.substring(match[0].length);
        }
      } else if (normalizedSearch === p) {
        clean = '';
      }
    }
  }

  // Loại bỏ các ký tự đặc biệt ở đầu nếu còn sót lại (VD: ": NGUYEN VAN A")
  clean = clean.replace(/^[\-\.\:\;\s]+/, '');

  // 2. Tìm điểm dừng (Stop Markers)
  const stopMarkers = [
    ' - ', '. ', ' NOI DUNG ', ' ND ', ' MEMO ', ' REF ', ' TT ', ' PHI ', ' / ',
    ';', 
    ' SO GD ' 
  ];
  
  let minIndex = clean.length;
  for (const m of stopMarkers) {
    const idx = clean.indexOf(m);
    if (idx !== -1 && idx < minIndex) {
      minIndex = idx;
    }
  }
  
  if (minIndex < clean.length) {
    clean = clean.substring(0, minIndex);
  }

  // 3. Xử lý "Dãy số" (Number Sequence) chặn ngay sau tên HOẶC ngay đầu tên (nếu là số tài khoản)
  // Nếu chuỗi bắt đầu bằng số (VD: "19033... NGUYEN VAN A"), cắt bỏ số
  const startingNumberMatch = clean.match(/^[\d\s\.]+/);
  if (startingNumberMatch && startingNumberMatch[0].length > 3) {
      clean = clean.substring(startingNumberMatch[0].length);
  }
  
  // Nếu có số ở giữa (chặn đuôi)
  const numberSeqMatch = clean.match(/[\s\:\.]+[\d]{6,}/); // 6 số trở lên mới cắt
  if (numberSeqMatch && numberSeqMatch.index) {
    clean = clean.substring(0, numberSeqMatch.index);
  }

  // Cleanup cuối cùng
  clean = clean.replace(/^[\-\.\:\;\s]+/, '');
  
  if (clean.length > 50) {
      const lastSpace = clean.lastIndexOf(' ', 50);
      if (lastSpace > 20) {
          clean = clean.substring(0, lastSpace);
      }
  }

  return clean.trim();
};

/**
 * Helper: Parse số tiền Việt Nam an toàn - STRICT MODE
 * Loại bỏ TOÀN BỘ dấu chấm (.) và phẩy (,) nếu chúng có vẻ là phân cách ngàn.
 * Khắc phục triệt để lỗi: 1.000.000 bị hiểu nhầm là 1.
 */
const parseVNAmount = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  
  let str = String(val).trim();
  
  // 1. Loại bỏ ký tự tiền tệ và khoảng trắng
  str = str.replace(/[₫VND\s]/gi, '');

  // 2. Xử lý số âm trong ngoặc: (5000) -> -5000
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }

  // 3. LOGIC MỚI: Dọn sạch dấu chấm và phẩy để lấy số nguyên
  // Hầu hết sao kê VN dùng dấu phân cách ngàn, rất ít khi dùng số thập phân (trừ khi là lãi suất lẻ)
  // Nếu chuỗi có dạng "1.000.000" hoặc "1,000,000", ta muốn kết quả là 1000000.
  
  // Loại bỏ tất cả dấu chấm và phẩy
  const cleanStr = str.replace(/[\.,]/g, '');
  
  const parsed = parseFloat(cleanStr);
  
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Xử lý import dữ liệu từ file Excel Backup (Format do app tạo ra)
 */
const parseBackupExcel = (workbook: any): StatementData => {
  const metaSheet = workbook.Sheets['METADATA_BACKUP'];
  const txSheet = workbook.Sheets['TRANSACTIONS_BACKUP'];

  if (!metaSheet || !txSheet) {
    throw new Error("File Backup không đúng định dạng (thiếu sheet bắt buộc).");
  }

  // 1. Parse Metadata
  const metaRows = utils.sheet_to_json(metaSheet) as any[];
  const meta: any = {};
  metaRows.forEach(row => {
    if (row.Key && row.Value !== undefined) {
      meta[row.Key] = row.Value;
    }
  });

  // 2. Parse Transactions
  const rawTxs = utils.sheet_to_json(txSheet) as any[];
  const transactions: Transaction[] = rawTxs.map((row: any) => ({
    date: String(row.date || ''),
    amount: Number(row.amount || 0),
    description: String(row.description || ''),
    transaction_code: String(row.transaction_code || ''),
    partner_name: String(row.partner_name || ''),
    partner_account: String(row.partner_account || ''),
    type: (row.type === 'CREDIT' ? 'CREDIT' : 'DEBIT'),
    category: String(row.category || 'Khác')
  }));

  return {
    id: meta.id,
    fileName: meta.fileName || 'Restored_Backup.xlsx',
    bankName: meta.bankName,
    accountHolder: meta.accountHolder,
    period: meta.period,
    savedAt: meta.savedAt ? Number(meta.savedAt) : Date.now(),
    transactions: transactions
  };
};

/**
 * Phân tích file Excel sao kê
 */
export const processExcelFile = async (
  file: File, 
  onProgress?: (percent: number) => void
): Promise<StatementData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        if (onProgress) onProgress(20);

        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = read(data, { type: 'array', cellDates: true }); 
        
        // --- LOGIC PHÁT HIỆN BACKUP ---
        // Nếu file có sheet "METADATA_BACKUP", xử lý như file backup
        if (workbook.SheetNames.includes('METADATA_BACKUP')) {
           if (onProgress) onProgress(50);
           const restoredData = parseBackupExcel(workbook);
           if (onProgress) onProgress(100);
           resolve(restoredData);
           return;
        }
        // ------------------------------

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawData = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (onProgress) onProgress(40);

        if (!rawData || rawData.length === 0) {
          throw new Error("File Excel trống hoặc không đọc được dữ liệu.");
        }

        // 1. Tìm dòng Header
        let headerRowIndex = -1;
        const colMap: Record<string, number> = {};

        // Từ khóa nhận diện cột (Lowercase + Normalized)
        const keywords = {
          date: ['ngay', 'ngày', 'date', 'time', 'thời gian', 'tnx date', 'ngay gd'],
          amount: ['so tien', 'số tiền', 'amount', 'phát sinh', 'giá trị', 'ps co', 'ps no', 'sotien', 'vnd'], 
          credit: ['ghi co', 'ghi có', 'credit', 'tiền vào', 'thu', 'cr', 'so tien ghi co', 'c', 'phat sinh co'],
          debit: ['ghi no', 'ghi nợ', 'debit', 'tiền ra', 'chi', 'dr', 'so tien ghi no', 'd', 'phat sinh no'], 
          description: ['noi dung', 'nội dung', 'dien giai', 'diễn giải', 'description', 'memo', 'remark', 'chi tiết', 'transactions in detail', 'detail', 'noi dung chi tiet'],
          code: ['ma gd', 'mã gd', 'ref', 'reference', 'code', 'tham chiếu', 'số ct', 'doc no', 'seq', 'so chung tu']
        };

        // Quét 100 dòng đầu
        for (let i = 0; i < Math.min(100, rawData.length); i++) {
          const row = rawData[i];
          if (!row || !Array.isArray(row)) continue;

          const tempMap: Record<string, number> = {};
          
          row.forEach((cell: any, colIdx: number) => {
             if (cell === null || cell === undefined) return;
             const val = String(cell)
                .toLowerCase()
                .replace(/[\n\r\t]+/g, ' ')
                .trim()
                .normalize('NFC');
             
             if (!val) return;
             
             if (keywords.date.some(k => val.includes(k))) { 
                 tempMap.date = colIdx; 
             }
             else if (keywords.credit.some(k => val.includes(k))) { 
                 tempMap.credit = colIdx; 
             }
             else if (keywords.debit.some(k => val.includes(k))) { 
                 tempMap.debit = colIdx; 
             }
             else if (
                 keywords.amount.some(k => val.includes(k)) && 
                 !val.includes('số dư') && 
                 !val.includes('balance') &&
                 !val.includes('ghi nợ') && 
                 !val.includes('ghi có')
             ) { 
                 tempMap.amount = colIdx; 
             }
             else if (keywords.description.some(k => val.includes(k))) { 
                 tempMap.description = colIdx; 
             }
             else if (keywords.code.some(k => val.includes(k))) { 
                 tempMap.code = colIdx; 
             }
          });

          const hasMoneyColumn = tempMap.amount !== undefined || (tempMap.credit !== undefined && tempMap.debit !== undefined);
          
          if (tempMap.date !== undefined && hasMoneyColumn) {
             headerRowIndex = i;
             Object.assign(colMap, tempMap);
             break;
          }
        }

        if (headerRowIndex === -1) {
           throw new Error("Không tìm thấy dòng tiêu đề hợp lệ. Vui lòng kiểm tra file Excel.");
        }

        if (onProgress) onProgress(60);

        // 2. Trích xuất dữ liệu
        let transactions: Transaction[] = [];
        
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;

          // Lấy Date
          let rawDate = row[colMap.date];
          if (rawDate === undefined || rawDate === null || rawDate === '') continue;

          let dateStr = '';
          if (rawDate instanceof Date) {
             dateStr = `${rawDate.getDate().toString().padStart(2,'0')}/${(rawDate.getMonth()+1).toString().padStart(2,'0')}/${rawDate.getFullYear()}`;
          } else {
             dateStr = String(rawDate).trim();
             if (!isNaN(Number(dateStr)) && Number(dateStr) > 20000) { 
                const dateObj = new Date(Math.round((Number(dateStr) - 25569) * 86400 * 1000));
                dateStr = `${dateObj.getDate().toString().padStart(2,'0')}/${(dateObj.getMonth()+1).toString().padStart(2,'0')}/${dateObj.getFullYear()}`;
             } else if (dateStr.includes('-')) {
                 const parts = dateStr.split('-');
                 if (parts[0].length === 4) { // YYYY-MM-DD
                     dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                 } else { // DD-MM-YYYY
                     dateStr = `${parts[0]}/${parts[1]}/${parts[2]}`;
                 }
             }
          }

          // Lấy Description
          const desc = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';

          // Lấy Amount và Type
          let amount = 0;
          let type: 'CREDIT' | 'DEBIT' = 'CREDIT';

          if (colMap.credit !== undefined && colMap.debit !== undefined) {
            let creditVal = parseVNAmount(row[colMap.credit]);
            let debitVal = parseVNAmount(row[colMap.debit]);

            if (creditVal > 0) {
              amount = creditVal;
              type = 'CREDIT';
            } else if (debitVal > 0) {
              amount = debitVal;
              type = 'DEBIT';
            } else {
               continue; 
            }
          } else if (colMap.amount !== undefined) {
             let val = parseVNAmount(row[colMap.amount]);
             
             if (val === 0) continue;

             if (val < 0) {
               amount = Math.abs(val);
               type = 'DEBIT';
             } else {
               amount = val;
               const upperDesc = desc.toUpperCase();
               if (upperDesc.includes('PHI ') || upperDesc.startsWith('TRICH NO') || upperDesc.startsWith('RUT TIEN') || upperDesc.includes('THU PHI') || upperDesc.includes('PAYMENT') || upperDesc.includes('DEBIT')) {
                 type = 'DEBIT';
               } else {
                 type = 'CREDIT'; 
               }
             }
          }

          // Lấy Partner Name (Passing Type to Helper for Strict Logic)
          const partnerName = extractPartnerName(desc, type);

          transactions.push({
            date: dateStr,
            amount: amount,
            description: desc,
            transaction_code: colMap.code !== undefined ? String(row[colMap.code] || '') : '',
            partner_name: partnerName,
            partner_account: '', 
            type: type,
            category: '' 
          });
        }

        if (onProgress) onProgress(80);

        // 3. Chuẩn hóa Category và Partner
        transactions = normalizeCategories(transactions);

        if (onProgress) onProgress(100);

        resolve({
          bankName: 'Excel Import',
          accountHolder: '', 
          period: '',
          transactions: transactions
        });

      } catch (error: any) {
        reject(error);
      }
    };

    reader.onerror = (err) => reject(new Error("Lỗi đọc file Excel"));
    reader.readAsArrayBuffer(file);
  });
};