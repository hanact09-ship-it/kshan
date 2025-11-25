import { GoogleGenAI, Type, Schema } from "@google/genai";
import { StatementData, Transaction } from "../types";
import * as pdfjsLib from 'pdfjs-dist';

// Xử lý sự khác biệt giữa các bản build của PDF.js trên CDN (ESM vs CommonJS wrapper)
const pdfJs = (pdfjsLib as any).default || pdfjsLib;

const getDocument = pdfJs.getDocument;
const GlobalWorkerOptions = pdfJs.GlobalWorkerOptions;

// Cấu hình Worker cho PDF.js
if (GlobalWorkerOptions) {
  GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// Helper: Wait function
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry wrapper for AI calls to handle rate limits (429)
const generateWithRetry = async (ai: any, params: any, retries = 5): Promise<any> => {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    // Robust check for 429 errors (API structure can vary)
    const isRateLimit = 
      error.status === 429 || 
      error.code === 429 ||
      (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED'))) ||
      (error.error && error.error.code === 429); // If error object is the JSON body

    // Nếu lỗi 429 (Too Many Requests) hoặc lỗi server tạm thời (503), thử lại với exponential backoff
    if (retries > 0 && (isRateLimit || error.status === 503)) {
      // Exponential backoff: Base 2s * 2^(5-retries). 
      const backoffFactor = Math.pow(2, 6 - retries);
      const delay = backoffFactor * 1000 + Math.random() * 1000; 
      
      console.warn(`Rate limit hit (429). Retrying in ${Math.round(delay)}ms... (${retries} retries left)`);
      await wait(delay);
      return generateWithRetry(ai, params, retries - 1);
    }
    throw error;
  }
};

// Schema tối ưu cho Transaction - Cập nhật logic tách cột Credit/Debit
const transactionSchema = {
  type: Type.OBJECT,
  properties: {
    d: { type: Type.STRING, description: "Date (DD/MM/YYYY)" },
    // Thay vì hỏi type và amount, hỏi riêng 2 cột để AI buộc phải nhìn đúng vị trí
    c_amt: { type: Type.NUMBER, description: "Credit Amount/Tiền vào (Positive Integer). NO separators." },
    d_amt: { type: Type.NUMBER, description: "Debit Amount/Tiền ra (Positive Integer). NO separators." },
    desc: { type: Type.STRING, description: "Full Description content" },
    code: { type: Type.STRING, description: "Transaction Code" },
    pn: { type: Type.STRING, description: "Partner Name (Sender/Receiver). Not numbers." },
    pa: { type: Type.STRING, description: "Partner Account" },
    cat: { type: Type.STRING, description: "Category in Vietnamese" }
  },
  required: ["d", "desc"] // Amount fields are optional but logic handles them
};

// Schema đầy đủ
const fullSchema = {
  type: Type.OBJECT,
  properties: {
    bank: { type: Type.STRING },
    holder: { type: Type.STRING },
    period: { type: Type.STRING },
    txs: { type: Type.ARRAY, items: transactionSchema }
  },
  required: ["txs"]
};

// Schema rút gọn
const listSchema = {
  type: Type.OBJECT,
  properties: {
    txs: { type: Type.ARRAY, items: transactionSchema }
  },
  required: ["txs"]
};

/**
 * Chuyển đổi một trang PDF thành hình ảnh Base64
 */
const renderPageToImage = async (pdfDoc: any, pageNum: number): Promise<string> => {
  const page = await pdfDoc.getPage(pageNum);
  // Tăng scale lên 3.0 (Ultra High Res) để nhìn rõ số 0, 6, 8, 9 và các nét mờ
  const viewport = page.getViewport({ scale: 3.0 });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  if (!context) throw new Error("Canvas context error");

  await page.render({ canvasContext: context, viewport: viewport }).promise;
  
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9); // Chất lượng cao
  // Dọn dẹp memory
  canvas.width = 0; 
  canvas.height = 0;
  
  return dataUrl.split(',')[1];
};

/**
 * Cải thiện phân loại dựa trên patterns của các giao dịch tương tự và từ khóa
 * Exported để dùng chung cho Excel Parser
 */
export const normalizeCategories = (transactions: Transaction[]): Transaction[] => {
  // 1. Xây dựng map "Partner Name" -> "Category phổ biến nhất" từ dữ liệu đã có
  const partnerMap: Record<string, Record<string, number>> = {};

  transactions.forEach(tx => {
    // Chỉ học từ những giao dịch có category rõ ràng (không phải null, rỗng hoặc 'Khác')
    if (tx.category && tx.category !== 'Khác' && tx.partner_name && tx.partner_name.length > 2) {
      const key = tx.partner_name.trim().toUpperCase();
      if (!partnerMap[key]) partnerMap[key] = {};
      partnerMap[key][tx.category] = (partnerMap[key][tx.category] || 0) + 1;
    }
  });

  // Tìm category chiến thắng cho mỗi partner
  const bestCategoryMap: Record<string, string> = {};
  Object.keys(partnerMap).forEach(partner => {
    const categories = partnerMap[partner];
    let bestCat = '';
    let maxCount = -1;
    
    Object.entries(categories).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        bestCat = cat;
      }
    });
    bestCategoryMap[partner] = bestCat;
  });

  // 2. Điền category cho các giao dịch thiếu hoặc 'Khác'
  return transactions.map(tx => {
    let newCategory = tx.category;
    const desc = (tx.description || '').toUpperCase();
    const partner = (tx.partner_name || '').trim().toUpperCase();

    // Nếu category chưa tốt
    if (!newCategory || newCategory === 'Khác') {
      
      // A. Thử tìm theo Partner Name đã học được
      if (partner && bestCategoryMap[partner]) {
        newCategory = bestCategoryMap[partner];
      }

      // B. Nếu vẫn chưa có, dùng bộ quy tắc từ khóa (Heuristics) - Đã nâng cấp
      if (!newCategory || newCategory === 'Khác') {
        // DI CHUYỂN
        if (desc.includes('GRAB') || desc.includes('BE GROUP') || desc.includes('GOJEK') || desc.includes('XANH SM') || desc.includes('UBER') || desc.includes('XANG') || desc.includes('PETROLIMEX') || desc.includes('VETC') || desc.includes('EPASS') || desc.includes('PARKING') || desc.includes('GUI XE')) {
          newCategory = 'Di chuyển';
        
        // MUA SẮM
        } else if (desc.includes('SHOPEE') || desc.includes('LAZADA') || desc.includes('TIKI') || desc.includes('TIKTOK') || desc.includes('PAYMENT') || desc.includes('APPLE.COM') || desc.includes('GOOGLE') || desc.includes('FACEBOOK') || desc.includes('ZALOPAY') || desc.includes('MOCA') || desc.includes('VNPAY') || desc.includes('POS') || desc.includes('SIEU THI') || desc.includes('MART') || desc.includes('CONVENIENCE')) {
          newCategory = 'Mua sắm';
        } else if (desc.includes('WINMART') || desc.includes('CIRCLE K') || desc.includes('GS25') || desc.includes('7-ELEVEN') || desc.includes('CO.OP') || desc.includes('MINISTOP') || desc.includes('TOP MARKET') || desc.includes('AEON') || desc.includes('UNIQLO')) {
          newCategory = 'Mua sắm';
        
        // ĂN UỐNG
        } else if (desc.includes('HIGHLANDS') || desc.includes('STARBUCKS') || desc.includes('PHUC LONG') || desc.includes('KFC') || desc.includes('MCDONALD') || desc.includes('LOTTERIA') || desc.includes('NHA HANG') || desc.includes('COFFEE') || desc.includes('CA PHE') || desc.includes('QUAN') || desc.includes('FOOD') || desc.includes('BAEMIN') || desc.includes('PIZZA') || desc.includes('BBQ')) {
          newCategory = 'Ăn uống';
        
        // ĐIỆN NƯỚC NET - Cập nhật logic: Bao gồm cả 'TIEN MUA DIEN'
        } else if (desc.includes('DIEN LUC') || desc.includes('EVN') || desc.includes('NUOC') || desc.includes('INTERNET') || desc.includes('VNPT') || desc.includes('FPT') || desc.includes('VIETTEL') || desc.includes('MOBIFONE') || desc.includes('VINAPHONE') || desc.includes('TELECOM') || desc.includes('TIEN DIEN') || desc.includes('TIEN MUA DIEN') || desc.includes('MUA DIEN')) {
          newCategory = 'Điện/Nước/Net';
        
        // PHÍ NGÂN HÀNG
        } else if (desc.includes('PHI') && (desc.includes('SMS') || desc.includes('DICH VU') || desc.includes('QLTK') || desc.includes('THUONG NIEN') || desc.includes('CHUYEN TIEN') || desc.includes('GIAO DICH') || desc.includes('VAT'))) {
          newCategory = 'Phí ngân hàng';
        
        // ĐẦU TƯ
        } else if (desc.includes('LAI TIEU DUNG') || desc.includes('TIET KIEM') || desc.includes('LAI NHAP GOC') || desc.includes('CHUNG KHOAN') || desc.includes('VPS') || desc.includes('TCBS') || desc.includes('VNDIRECT') || desc.includes('SSI') || desc.includes('DIGITAL ASSET') || desc.includes('INVEST')) {
          newCategory = 'Đầu tư';
        
        // LƯƠNG THƯỞNG
        } else if (desc.includes('LUONG') || desc.includes('SALARY') || desc.includes('THUONG') || desc.includes('INCOME') || desc.includes('PAYROLL')) {
          newCategory = 'Lương/Thưởng';

        // GIÁO DỤC
        } else if (desc.includes('HOC PHI') || desc.includes('SCHOOL') || desc.includes('EDUCATION') || desc.includes('TUITION') || desc.includes('DAI HOC') || desc.includes('TIEU HOC') || desc.includes('MAM NON') || desc.includes('KHOA HOC')) {
          newCategory = 'Giáo dục';

        // SỨC KHỎE
        } else if (desc.includes('BENH VIEN') || desc.includes('PHARMACY') || desc.includes('NHA THUOC') || desc.includes('KHAM') || desc.includes('MEDIC') || desc.includes('HEALTH') || desc.includes('SPA')) {
          newCategory = 'Sức khỏe';

        // GIẢI TRÍ
        } else if (desc.includes('CGV') || desc.includes('NETFLIX') || desc.includes('SPOTIFY') || desc.includes('YOUTUBE') || desc.includes('CINEMA') || desc.includes('GAME') || desc.includes('STEAM') || desc.includes('KARAOKE')) {
          newCategory = 'Giải trí';

        // CHUYỂN TIỀN (Cuối cùng)
        } else if (desc.includes('CHUYEN TIEN') || desc.includes('CK') || desc.includes('IBFT') || desc.includes('NAP') || desc.includes('RUT')) {
          newCategory = 'Chuyển tiền';
        }
      }
    }

    return {
      ...tx,
      category: newCategory || 'Khác'
    };
  });
};

/**
 * Hàm chính phân tích PDF (Có hỗ trợ xử lý song song và callback tiến độ)
 */
export const analyzePdfStatement = async (
  base64Pdf: string, 
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<StatementData> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key không tìm thấy.");

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash"; // Use cheaper/faster model for bulk processing

  if (!getDocument) throw new Error("Lỗi tải thư viện PDF.js. Vui lòng tải lại trang.");

  const loadingTask = getDocument({ data: atob(base64Pdf) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  console.log(`PDF có ${numPages} trang. Bắt đầu xử lý...`);

  // QUAN TRỌNG: Giảm Batch Size xuống 1 để đảm bảo AI đọc kỹ từng trang, không bỏ sót dòng.
  // Đổi Scale lên 3.0 (ở hàm renderPageToImage) để ảnh nét hơn.
  const BATCH_SIZE = 1; 
  const batches: number[] = [];
  for (let i = 1; i <= numPages; i += BATCH_SIZE) {
    batches.push(i);
  }
  
  const totalBatches = batches.length;
  let completedBatches = 0;
  
  // Kết quả chung
  let allTransactions: any[] = [];
  let bankInfo = { bank: '', holder: '', period: '' };

  // Worker xử lý một batch
  const processBatch = async (startPage: number) => {
    const endPage = Math.min(startPage + BATCH_SIZE - 1, numPages);
    
    try {
      // Render images
      const imageParts = [];
      for (let p = startPage; p <= endPage; p++) {
        const base64Image = await renderPageToImage(pdfDoc, p);
        imageParts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image
          }
        });
      }

      const isFirstBatch = startPage === 1;
      const currentSchema = isFirstBatch ? fullSchema : listSchema;
      
      const promptText = `Nhiệm vụ: Trích xuất CHÍNH XÁC 100% dữ liệu bảng sao kê (Trang ${startPage}-${endPage}).

      QUAN TRỌNG VỀ SỐ LIỆU VÀ CỘT:
      1. Nhận diện Số tiền (Amount):
         - CẢNH BÁO: Dấu chấm "." hoặc phẩy "," trong "1.000.000" hoặc "1,000,000" CHỈ là phân cách ngàn.
         - QUY TẮC BẮT BUỘC: LOẠI BỎ TOÀN BỘ dấu chấm và dấu phẩy trong số tiền. Chỉ giữ lại số nguyên (0-9).
         - Ví dụ: Thấy "1.000.000" -> Ghi 1000000. Thấy "50,000" -> Ghi 50000. Tuyệt đối KHÔNG ghi là 1 hay 50.

      2. Phân loại Nợ (Debit) / Có (Credit) - ƯU TIÊN VỊ TRÍ CỘT:
         - Nếu số nằm ở cột "Ghi Nợ", "Debit", "Chi", "-" -> Điền vào 'd_amt'.
         - Nếu số nằm ở cột "Ghi Có", "Credit", "Thu", "+" -> Điền vào 'c_amt'.

      3. Partner Name (pn) - Logic Tiếng Việt (có dấu và không dấu):
         - TÊN ĐỐI TÁC KHÔNG PHẢI LÀ SỐ. Nếu sau từ khóa là dãy số (VD: số tài khoản), hãy bỏ qua và lấy chữ phía sau.
         - Tiền ra (Debit/Chi): Tìm sau "TỚI", "TO", "CHUYEN TOI", "CHUYEN SANG", "SANG","THU HUONG", "CK", "TOI:", "DEN:", "TOI","GD", "CHO:".
         - Tiền vào (Credit/Thu): Tìm sau "TỪ", "FROM", "NHAN TU", "CHUYEN TU", "NGUOI CHUYEN", "SENDER", "TU:", "TU".
         - Xử lý xung đột: Nếu có cả "TU" và "TOI" (hoặc "FROM"/"TO") (hoặc cả "TU" và "DEN") (hoặc cả "TU" và "SANG"):
             + Nếu là Tiền ra -> Lấy tên sau "TOI"/"DEN"/"THU HUONG"/"SANG".
             + Nếu là Tiền vào -> Lấy tên sau "TU"/"NGUOI CHUYEN".
         - Hỗ trợ cả không dấu: "CHUYEN KHOAN", "CHUYEN TIEN", "CK", "NGUOI HUONG".

      Yêu cầu: TUYỆT ĐỐI KHÔNG BỎ SÓT DÒNG NÀO. Trả về đầy đủ số lượng giao dịch nhìn thấy.`;

      const response = await generateWithRetry(ai, {
        model: model,
        contents: { parts: [...imageParts, { text: promptText }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: currentSchema as Schema,
        }
      });

      const text = response.text;
      if (text) {
        const batchData = JSON.parse(text);
        return { 
          success: true, 
          data: batchData, 
          isFirst: isFirstBatch 
        };
      }
    } catch (err) {
      console.error(`Lỗi batch ${startPage}-${endPage}:`, err);
    }
    return { success: false };
  };

  // Quản lý concurrency 
  const CONCURRENCY_LIMIT = 2; // Tăng lên 2 vì Batch Size đã giảm xuống 1
  const queue = [...batches];
  
  const worker = async () => {
    while (queue.length > 0) {
      const startPage = queue.shift();
      if (startPage === undefined) break;
      
      const result = await processBatch(startPage);
      
      if (result.success && result.data) {
        if (result.isFirst) {
          bankInfo = {
            bank: result.data.bank || bankInfo.bank,
            holder: result.data.holder || bankInfo.holder,
            period: result.data.period || bankInfo.period
          };
        }
        if (result.data.txs && Array.isArray(result.data.txs)) {
          // Push vào mảng chung (Do JS đơn luồng nên push này an toàn)
          allTransactions.push(...result.data.txs);
        }
      }

      completedBatches++;
      if (onProgress) {
        const processedPages = Math.min(completedBatches * BATCH_SIZE, numPages);
        onProgress(
          Math.round((completedBatches / totalBatches) * 100),
          processedPages,
          numPages
        );
      }

      // Thêm delay nhỏ giữa các batch để giảm tải API và tránh rate limit
      if (queue.length > 0) {
        await wait(500); // Giảm delay một chút vì xử lý từng trang nhẹ hơn
      }
    }
  };

  // Khởi chạy workers
  const workers = Array(Math.min(batches.length, CONCURRENCY_LIMIT))
    .fill(null)
    .map(() => worker());
    
  await Promise.all(workers);

  // Map dữ liệu sang format Transaction
  let transactions: Transaction[] = allTransactions.map((tx: any) => {
    // Logic xác định Type và Amount chính xác từ 2 cột c_amt và d_amt
    let amount = 0;
    let type: 'CREDIT' | 'DEBIT' = 'CREDIT';

    const c = Number(tx.c_amt) || 0;
    const d = Number(tx.d_amt) || 0;

    if (d > 0) {
      amount = d;
      type = 'DEBIT';
    } else if (c > 0) {
      amount = c;
      type = 'CREDIT';
    } else if (tx.a) { 
      // Fallback nếu AI đời cũ vẫn trả về 'a' và 't'
      amount = Number(tx.a);
      type = tx.t === 'D' ? 'DEBIT' : 'CREDIT';
    }

    return {
      date: tx.d,
      amount: amount,
      type: type,
      description: tx.desc,
      transaction_code: tx.code,
      partner_name: tx.pn,
      partner_account: tx.pa,
      category: tx.cat
    };
  });
  
  // Áp dụng logic cải thiện phân loại (Post-processing)
  transactions = normalizeCategories(transactions);
  
  if (transactions.length === 0) {
    throw new Error("Không trích xuất được dữ liệu. Vui lòng thử lại hoặc kiểm tra file.");
  }

  return {
    bankName: bankInfo.bank,
    accountHolder: bankInfo.holder,
    period: bankInfo.period,
    transactions: transactions
  };
};