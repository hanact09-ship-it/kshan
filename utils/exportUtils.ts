import { utils, writeFile } from 'xlsx';
import { StatementData, GroupedData } from '../types';

export const exportRawData = (data: StatementData) => {
  try {
    // 1. Prepare Transactions Data
    const transactionRows = data.transactions.map(tx => ({
      "Ngày": tx.date,
      "Mã GD": tx.transaction_code || '',
      "Đối tác": tx.partner_name || '',
      "Số TK Đối tác": tx.partner_account || '',
      "Phân loại": tx.category || '',
      "Nội dung": tx.description,
      "Số tiền": tx.amount,
      "Loại": tx.type === 'CREDIT' ? 'Tiền vào' : 'Tiền ra',
      "Dấu": tx.type === 'CREDIT' ? 1 : -1
    }));

    // 2. Prepare Summary Data
    const totalCredit = data.transactions
      .filter(t => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalDebit = data.transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);

    const summaryRows = [
      { "Thông tin": "Ngân hàng", "Giá trị": data.bankName || "Không xác định" },
      { "Thông tin": "Chủ tài khoản", "Giá trị": data.accountHolder || "Không xác định" },
      { "Thông tin": "Giai đoạn", "Giá trị": data.period || "Không xác định" },
      { "Thông tin": "Tổng số giao dịch", "Giá trị": data.transactions.length },
      { "Thông tin": "Tổng tiền vào (+)", "Giá trị": totalCredit },
      { "Thông tin": "Tổng tiền ra (-)", "Giá trị": totalDebit },
      { "Thông tin": "Số dư ròng", "Giá trị": totalCredit - totalDebit }
    ];

    // 3. Create Workbook
    const wb = utils.book_new();
    
    const wsTransactions = utils.json_to_sheet(transactionRows);
    const wsSummary = utils.json_to_sheet(summaryRows);

    // Set column widths
    wsTransactions['!cols'] = [
      { wch: 12 }, // Date
      { wch: 15 }, // Code
      { wch: 30 }, // Partner
      { wch: 20 }, // Account
      { wch: 15 }, // Category
      { wch: 50 }, // Description
      { wch: 15 }, // Amount
      { wch: 10 }, // Type
      { wch: 5 }   // Sign
    ];

    wsSummary['!cols'] = [
      { wch: 25 }, 
      { wch: 30 }
    ];

    utils.book_append_sheet(wb, wsTransactions, "Chi tiết giao dịch");
    utils.book_append_sheet(wb, wsSummary, "Tổng hợp chung");

    const cleanBankName = (data.bankName || 'Statement').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `BaoCao_${cleanBankName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    writeFile(wb, fileName);
  } catch (error) {
    console.error("Lỗi khi xuất Excel:", error);
    alert("Có lỗi xảy ra khi xuất file Excel. Vui lòng thử lại.");
  }
};

export const exportGroupedData = (groups: GroupedData[], groupByLabel: string) => {
  try {
    // Sheet 1: Summary of Groups
    const summaryRows = groups.map(g => ({
      [groupByLabel]: g.key,
      "Số lượng GD": g.count,
      "Tiền vào (+)": g.totalCredit,
      "Tiền ra (-)": g.totalDebit,
      "Tổng lưu chuyển": g.totalAmount,
      "Trung bình": g.averageAmount
    }));

    // Sheet 2: Detailed Transactions by Group
    const detailRows: any[] = [];
    groups.forEach(g => {
      g.transactions.forEach(tx => {
        detailRows.push({
          [groupByLabel]: g.key, // Cột nhóm để lọc
          "Ngày": tx.date,
          "Mã GD": tx.transaction_code,
          "Đối tác": tx.partner_name,
          "Số TK Đối tác": tx.partner_account,
          "Nội dung": tx.description,
          "Phân loại": tx.category,
          "Số tiền": tx.amount,
          "Loại GD": tx.type === 'CREDIT' ? 'Tiền vào' : 'Tiền ra'
        });
      });
    });

    const wb = utils.book_new();
    
    // Create Sheets
    const wsSummary = utils.json_to_sheet(summaryRows);
    const wsDetails = utils.json_to_sheet(detailRows);
    
    // Formatting
    wsSummary['!cols'] = [
      { wch: 35 }, // Key
      { wch: 15 }, // Count
      { wch: 20 }, // Credit
      { wch: 20 }, // Debit
      { wch: 20 }, // Total
      { wch: 20 }  // Average
    ];

    wsDetails['!cols'] = [
      { wch: 30 }, // Group Key
      { wch: 12 }, // Date
      { wch: 15 }, // Code
      { wch: 25 }, // Partner
      { wch: 20 }, // Account
      { wch: 40 }, // Desc
      { wch: 15 }, // Category
      { wch: 15 }, // Amount
      { wch: 10 }  // Type
    ];

    utils.book_append_sheet(wb, wsSummary, "Tổng hợp theo nhóm");
    utils.book_append_sheet(wb, wsDetails, "Chi tiết giao dịch");
    
    const fileName = `SaoKe_GopNhom_${new Date().toISOString().slice(0, 10)}.xlsx`;
    
    writeFile(wb, fileName);
  } catch (error) {
    console.error("Lỗi khi xuất Excel:", error);
    alert("Có lỗi xảy ra khi xuất file Excel.");
  }
};

/**
 * Xuất file Excel Backup - Dùng để lưu trữ lâu dài và restore lại vào App
 * Cấu trúc gồm 2 sheets: 
 * 1. METADATA_BACKUP: Chứa thông tin chung
 * 2. TRANSACTIONS_BACKUP: Chứa dữ liệu giao dịch thô
 */
export const exportExcelBackup = (data: StatementData) => {
  try {
    const wb = utils.book_new();

    // Sheet 1: Metadata
    const metaData = [
      { Key: 'id', Value: data.id },
      { Key: 'fileName', Value: data.fileName },
      { Key: 'bankName', Value: data.bankName },
      { Key: 'accountHolder', Value: data.accountHolder },
      { Key: 'period', Value: data.period },
      { Key: 'savedAt', Value: data.savedAt || Date.now() },
      { Key: 'VERSION', Value: '1.0' } // Version control
    ];
    const wsMeta = utils.json_to_sheet(metaData);

    // Sheet 2: Transactions (Raw Data)
    // Map chính xác các trường trong interface Transaction
    const txData = data.transactions.map(tx => ({
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      transaction_code: tx.transaction_code,
      partner_name: tx.partner_name,
      partner_account: tx.partner_account,
      type: tx.type,
      category: tx.category
    }));
    const wsTx = utils.json_to_sheet(txData);

    // Append sheets with specific names for detection
    utils.book_append_sheet(wb, wsMeta, "METADATA_BACKUP");
    utils.book_append_sheet(wb, wsTx, "TRANSACTIONS_BACKUP");

    const cleanName = (data.fileName || 'backup').replace(/\.[^/.]+$/, "");
    const fileName = `${cleanName}_FullBackup.xlsx`;

    writeFile(wb, fileName);
  } catch (error) {
    console.error("Lỗi khi xuất Excel Backup:", error);
    alert("Có lỗi xảy ra khi tạo file Backup.");
  }
};