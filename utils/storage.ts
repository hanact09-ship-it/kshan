import { StatementData, SavedStatementSummary } from '../types';

const STORAGE_KEY = 'smart_bank_statements_v1';

// Tạo ID ngẫu nhiên
const generateId = () => Math.random().toString(36).substr(2, 9);

export const saveStatementToStorage = (data: StatementData, fileName: string): StatementData => {
  try {
    const savedItemsStr = localStorage.getItem(STORAGE_KEY);
    const savedItems: StatementData[] = savedItemsStr ? JSON.parse(savedItemsStr) : [];

    // Nếu data đã có ID (đang sửa cái cũ), update nó. Nếu chưa, tạo mới.
    const newData = {
      ...data,
      id: data.id || generateId(),
      fileName: data.fileName || fileName,
      savedAt: Date.now()
    };

    const existingIndex = savedItems.findIndex(item => item.id === newData.id);
    
    if (existingIndex >= 0) {
      savedItems[existingIndex] = newData;
    } else {
      savedItems.push(newData);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
    return newData;
  } catch (error) {
    console.error("Storage full or error", error);
    throw new Error("Không thể lưu. Bộ nhớ trình duyệt có thể đã đầy.");
  }
};

export const getStoredStatementsList = (): SavedStatementSummary[] => {
  try {
    const savedItemsStr = localStorage.getItem(STORAGE_KEY);
    if (!savedItemsStr) return [];
    const savedItems: StatementData[] = JSON.parse(savedItemsStr);

    // Chỉ trả về thông tin tóm tắt để hiển thị list
    return savedItems.map(item => ({
      id: item.id!,
      fileName: item.fileName || 'Unknown File',
      bankName: item.bankName || 'Unknown Bank',
      period: item.period || '',
      savedAt: item.savedAt || Date.now(),
      transactionCount: item.transactions.length
    })).sort((a, b) => b.savedAt - a.savedAt);
  } catch (error) {
    return [];
  }
};

export const getStatementById = (id: string): StatementData | null => {
  try {
    const savedItemsStr = localStorage.getItem(STORAGE_KEY);
    if (!savedItemsStr) return null;
    const savedItems: StatementData[] = JSON.parse(savedItemsStr);
    return savedItems.find(item => item.id === id) || null;
  } catch (error) {
    return null;
  }
};

export const deleteStatementById = (id: string) => {
  try {
    const savedItemsStr = localStorage.getItem(STORAGE_KEY);
    if (!savedItemsStr) return;
    let savedItems: StatementData[] = JSON.parse(savedItemsStr);
    savedItems = savedItems.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
  } catch (error) {
    console.error(error);
  }
};