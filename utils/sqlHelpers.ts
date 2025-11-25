import { StatementData, Transaction } from '../types';

/**
 * Escapes single quotes for SQL (e.g., 'It's' -> 'It''s')
 */
const sqlEscape = (str: string | null | undefined): string => {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
};

/**
 * Helper to extract SQL values from a tuple string like "('date', 100, ...)"
 */
const extractValues = (str: string): (string | number | null)[] => {
  const matches: (string | number | null)[] = [];
  // Regex giải thích:
  // 1. '((?:[^']|'')*)' -> Chuỗi trong dấu nháy đơn, chấp nhận '' là escape của '
  // 2. NULL -> Giá trị null (case insensitive)
  // 3. ([-\d]+(?:\.\d+)?) -> Số (nguyên hoặc thập phân, có thể âm)
  const sqlValueRegex = /(?:'((?:[^']|'')*)'|(NULL)|([-\d]+(?:\.\d+)?))/gi;
  
  let match;
  while ((match = sqlValueRegex.exec(str)) !== null) {
      if (match[1] !== undefined) {
          // Là chuỗi: unescape '' thành '
          matches.push(match[1].replace(/''/g, "'")); 
      } else if (match[2] !== undefined) {
          // Là NULL
          matches.push(null); 
      } else if (match[3] !== undefined) {
          // Là số
          matches.push(Number(match[3])); 
      }
  }
  return matches;
};

/**
 * Generates a .sql file content from StatementData
 */
export const generateSQL = (data: StatementData): string => {
  const timestamp = new Date().toISOString();
  const stmtId = data.id || Date.now().toString();
  
  let sql = `-- Smart Bank Statement Backup\n`;
  sql += `-- Created at: ${timestamp}\n`;
  sql += `-- Bank: ${data.bankName || 'Unknown'}\n\n`;

  // 1. Create Tables Structure
  sql += `CREATE TABLE IF NOT EXISTS statements (
    id TEXT PRIMARY KEY,
    file_name TEXT,
    bank_name TEXT,
    account_holder TEXT,
    period TEXT,
    saved_at INTEGER
);\n\n`;

  sql += `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id TEXT,
    date TEXT,
    amount REAL,
    description TEXT,
    transaction_code TEXT,
    partner_name TEXT,
    partner_account TEXT,
    type TEXT,
    category TEXT,
    FOREIGN KEY(statement_id) REFERENCES statements(id)
);\n\n`;

  // 2. Insert Statement Info
  sql += `INSERT INTO statements (id, file_name, bank_name, account_holder, period, saved_at) VALUES (
    ${sqlEscape(stmtId)},
    ${sqlEscape(data.fileName)},
    ${sqlEscape(data.bankName)},
    ${sqlEscape(data.accountHolder)},
    ${sqlEscape(data.period)},
    ${Date.now()}
);\n\n`;

  // 3. Insert Transactions
  if (data.transactions.length > 0) {
    sql += `INSERT INTO transactions (statement_id, date, amount, description, transaction_code, partner_name, partner_account, type, category) VALUES\n`;
    
    const values = data.transactions.map(tx => {
      return `(${sqlEscape(stmtId)}, ${sqlEscape(tx.date)}, ${tx.amount}, ${sqlEscape(tx.description)}, ${sqlEscape(tx.transaction_code)}, ${sqlEscape(tx.partner_name)}, ${sqlEscape(tx.partner_account)}, ${sqlEscape(tx.type)}, ${sqlEscape(tx.category)})`;
    });

    sql += values.join(',\n') + ';\n';
  }

  return sql;
};

/**
 * Parses a .sql file content back into StatementData
 * Sử dụng State Machine Parser để đảm bảo độ chính xác tuyệt đối với file lớn hoặc chứa ký tự đặc biệt
 */
export const parseSQL = (sqlContent: string): StatementData => {
  try {
    // 1. Extract Statement Info (Metadata thường ngắn, dùng Regex ok)
    const stmtMatch = sqlContent.match(/INSERT INTO statements\s*\([^)]+\)\s*VALUES\s*\(([\s\S]+?)\);/i);

    if (!stmtMatch) {
      throw new Error("Không tìm thấy thông tin sao kê (bảng statements) trong file SQL.");
    }

    const stmtValuesStr = stmtMatch[1];
    const stmtData = extractValues(stmtValuesStr);
    
    if (stmtData.length < 6) {
        throw new Error("Dữ liệu bảng statements không đủ trường thông tin.");
    }

    // 2. Extract Transactions (Sử dụng State Machine Parser)
    const transactions: Transaction[] = [];
    
    // Tìm tất cả vị trí bắt đầu của câu lệnh INSERT transactions
    // File SQL có thể chia thành nhiều câu lệnh INSERT, Regex này tìm điểm bắt đầu của từng khối
    const insertRegex = /INSERT INTO transactions\s*(?:\([^)]+\))?\s*VALUES/gi;
    let match;

    while ((match = insertRegex.exec(sqlContent)) !== null) {
        // Vị trí bắt đầu quét giá trị (ngay sau từ khóa VALUES)
        let currentIndex = match.index + match[0].length;
        
        let inString = false;      // Đang trong dấu nháy đơn '...'
        let parenDepth = 0;        // Độ sâu ngoặc đơn (...)
        let tupleStart = -1;       // Vị trí bắt đầu của 1 hàng dữ liệu
        
        // Quét từng ký tự cho đến hết file hoặc gặp dấu chấm phẩy kết thúc lệnh
        while (currentIndex < sqlContent.length) {
            const char = sqlContent[currentIndex];

            if (inString) {
                if (char === "'") {
                    // Kiểm tra escape: Nếu ký tự tiếp theo cũng là ' thì là escape, không phải hết chuỗi
                    if (sqlContent[currentIndex + 1] === "'") {
                        currentIndex++; // Bỏ qua ký tự escape
                    } else {
                        inString = false; // Kết thúc chuỗi
                    }
                }
            } else {
                // Không ở trong chuỗi
                if (char === "'") {
                    inString = true;
                } else if (char === '(') {
                    if (parenDepth === 0) tupleStart = currentIndex; // Bắt đầu 1 tuple
                    parenDepth++;
                } else if (char === ')') {
                    parenDepth--;
                    if (parenDepth === 0 && tupleStart !== -1) {
                        // Đã tìm thấy trọn vẹn 1 tuple: (val1, val2, ...)
                        // Trích xuất chuỗi tuple (bỏ ngoặc đầu cuối để parse dễ hơn, hoặc giữ nguyên tùy hàm extract)
                        const tupleStr = sqlContent.substring(tupleStart + 1, currentIndex); // Lấy nội dung trong ngoặc
                        
                        const cols = extractValues(tupleStr);
                        
                        // Mapping columns:
                        // statement_id(0), date(1), amount(2), desc(3), code(4), partner(5), account(6), type(7), cat(8)
                        if (cols.length >= 9) {
                            transactions.push({
                                date: String(cols[1] || ''),
                                amount: Number(cols[2] || 0),
                                description: String(cols[3] || ''),
                                transaction_code: String(cols[4] || ''),
                                partner_name: String(cols[5] || ''),
                                partner_account: String(cols[6] || ''),
                                type: (String(cols[7]) === 'CREDIT' ? 'CREDIT' : 'DEBIT'),
                                category: String(cols[8] || '')
                            });
                        }

                        tupleStart = -1; // Reset
                    }
                } else if (char === ';' && parenDepth === 0) {
                    // Gặp dấu chấm phẩy ở ngoài cùng -> Kết thúc câu lệnh INSERT này
                    break; 
                }
            }
            currentIndex++;
        }
    }

    return {
        id: String(stmtData[0] || ''),
        fileName: String(stmtData[1] || 'Recovered_Statement'),
        bankName: String(stmtData[2] || ''),
        accountHolder: String(stmtData[3] || ''),
        period: String(stmtData[4] || ''),
        savedAt: Number(stmtData[5] || Date.now()),
        transactions: transactions
    };

  } catch (error) {
    console.error("SQL Parse Error:", error);
    throw new Error("File SQL bị lỗi hoặc không đúng định dạng.");
  }
};