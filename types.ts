export interface Transaction {
  date: string;
  amount: number;
  description: string;
  transaction_code: string;
  partner_name: string;
  partner_account: string;
  type: 'CREDIT' | 'DEBIT'; // Credit = Tiền vào (+), Debit = Tiền ra (-)
  category?: string; // Phân loại giao dịch (VD: Ăn uống, Mua sắm...)
}

export interface StatementData {
  id?: string; // ID duy nhất khi lưu
  fileName?: string; // Tên file gốc
  savedAt?: number; // Thời gian lưu
  bankName?: string;
  accountHolder?: string;
  period?: string;
  transactions: Transaction[];
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  READING_FILE = 'READING_FILE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export enum GroupByOption {
  PARTNER_NAME = 'PARTNER_NAME',
  PARTNER_ACCOUNT = 'PARTNER_ACCOUNT',
  DATE = 'DATE',
  TRANSACTION_TYPE = 'TRANSACTION_TYPE',
  CATEGORY = 'CATEGORY'
}

export interface GroupedData {
  key: string;
  totalAmount: number; // Tổng lưu chuyển (Volume)
  totalCredit: number; // Tổng tiền vào
  totalDebit: number;  // Tổng tiền ra
  count: number;
  transactions: Transaction[];
  averageAmount: number;
}

export interface FilterCriteria {
  keyword: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  minAmount: string;
  maxAmount: string;
  categories: string[];
}

export interface SavedStatementSummary {
  id: string;
  fileName: string;
  bankName: string;
  period: string;
  savedAt: number;
  transactionCount: number;
}