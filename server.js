const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.json');

// Helper: Đọc CSDL
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    return [];
  }
}

// Helper: Ghi CSDL
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi ghi DB:', e);
  }
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' })); // Tăng limit cho hội thoại dài
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// Helper: Trích xuất văn bản từ các loại file khác nhau
// ============================================================
async function processDocument(url) {
  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.buffer();

    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(buffer);
      return `[NỘI DUNG FILE PDF: ${url}]\n${data.text}\n`;
    } 
    else if (contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') || url.toLowerCase().endsWith('.docx')) {
      const data = await mammoth.extractRawText({ buffer });
      return `[NỘI DUNG FILE WORD: ${url}]\n${data.value}\n`;
    } 
    else if (contentType.includes('text/plain') || url.toLowerCase().endsWith('.txt')) {
      return `[NỘI DUNG FILE TXT: ${url}]\n${buffer.toString()}\n`;
    }
    
    return null;
  } catch (err) {
    console.error(`Error processing file ${url}:`, err.message);
    return null;
  }
}

// ============================================================
// Helper: Kiểm tra xem URL có phải là tài liệu hay không (qua Content-Type)
// ============================================================
async function isDocumentUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', timeout: 5000 });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    return (
      contentType.includes('application/pdf') ||
      contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
      contentType.includes('text/plain')
    );
  } catch (e) {
    return false;
  }
}

// ============================================================
// Helper: Trích xuất văn bản từ các loại file khác nhau
// ============================================================
async function processDocument(url) {
  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.buffer();

    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(buffer);
      return `[NỘI DUNG FILE PDF: ${url}]\n${data.text}\n`;
    } 
    else if (contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') || url.toLowerCase().endsWith('.docx')) {
      const data = await mammoth.extractRawText({ buffer });
      return `[NỘI DUNG FILE WORD: ${url}]\n${data.value}\n`;
    } 
    else if (contentType.includes('text/plain') || url.toLowerCase().endsWith('.txt')) {
      return `[NỘI DUNG FILE TXT: ${url}]\n${buffer.toString()}\n`;
    }
    
    return null;
  } catch (err) {
    console.error(`Error processing file ${url}:`, err.message);
    return null;
  }
}

// ============================================================
// Route: Scrape nội dung từ URL và các file đính kèm (Deep Scraping)
// ============================================================
app.get('/scrape', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Thiếu tham số url' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    // 1. Phân tích nội dung trang chính
    const pageTitle = $('title').text().trim() || 'Không có tiêu đề';
    
    // Lưu tạm bản sao để tìm link
    const $allLinks = $('a');
    
    $('script, style, nav, footer, header, iframe, noscript, aside').remove();
    let mainContent = $('body').text();

    // 2. Tìm tài liệu trực tiếp và các trang "Chi tiết"
    const docLinks = new Set();
    const subPageLinks = new Set();
    const keywords = ['chi tiết', 'xem thêm', 'thông báo', 'detail', 'read more', 'click', 'tải', 'download'];

    $allLinks.each((i, el) => {
      let href = $(el).attr('href');
      let text = $(el).text().toLowerCase();
      if (!href) return;

      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        if (absoluteUrl.startsWith('javascript:')) return;

        const lowHref = absoluteUrl.toLowerCase();
        
        // Nhận diện theo đuôi file
        if (lowHref.endsWith('.pdf') || lowHref.endsWith('.docx') || lowHref.endsWith('.txt')) {
          docLinks.add(absoluteUrl);
        } else {
          // Nhận diện trang con tiềm năng có tài liệu
          const isInteresting = keywords.some(k => text.includes(k) || lowHref.includes(k));
          if (isInteresting && absoluteUrl.startsWith(baseUrl.origin)) {
            subPageLinks.add(absoluteUrl);
          }
        }
      } catch (e) {}
    });

    console.log(`🔍 Trang chính: Tìm thấy ${docLinks.size} file trực tiếp và ${subPageLinks.size} trang con tiềm năng.`);

    // 3. Deep Scraping cấp độ 1: Truy cập các trang con để tìm file
    const limitedSubPages = Array.from(subPageLinks).slice(0, 5); // Tối đa 5 trang con
    
    const subPageResults = await Promise.all(
      limitedSubPages.map(async (subUrl) => {
        try {
          const subRes = await fetch(subUrl, { timeout: 10000 });
          if (!subRes.ok) return [];
          const subHtml = await subRes.text();
          const sub$ = cheerio.load(subHtml);
          const localDocs = [];
          
          sub$('a').each((i, el) => {
            const h = sub$(el).attr('href');
            if (!h) return;
            try {
              const absH = new URL(h, subUrl).href;
              const lowH = absH.toLowerCase();
              if (lowH.endsWith('.pdf') || lowH.endsWith('.docx') || lowH.endsWith('.txt')) {
                localDocs.push(absH);
              }
            } catch (e) {}
          });
          return localDocs;
        } catch (e) {
          return [];
        }
      })
    );

    // Gộp tất cả các link file tìm được
    subPageResults.flat().forEach(link => docLinks.add(link));

    // 4. Xử lý đồng thời các tài liệu (Max 10 file)
    const finalDocLinks = Array.from(docLinks).slice(0, 10);
    console.log(`🚀 Tổng cộng xử lý: ${finalDocLinks.length} tài liệu...`);

    const docTexts = await Promise.all(
      finalDocLinks.map(link => processDocument(link))
    );

    // Gộp tất cả nội dung
    let finalContent = `--- NỘI DUNG TRANG CHÍNH (${url}) ---\n${mainContent}\n\n`;
    
    docTexts.filter(t => t !== null).forEach(text => {
      finalContent += `--- TÀI LIỆU CỦA TRANG ---\n${text}\n`;
    });

    // Làm sạch
    finalContent = finalContent
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const MAX_CHARS = 100000; // Tăng thêm cho Deep Scraping
    if (finalContent.length > MAX_CHARS) {
      finalContent = finalContent.substring(0, MAX_CHARS) + '\n\n[... Nội dung quá dài nên đã bị cắt bớt ...]';
    }

    // Lưu vào CSDL
    const db = readDB();
    const existingIndex = db.findIndex(item => item.url === url);
    const newData = {
      url,
      title: pageTitle,
      content: finalContent,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex > -1) {
      db[existingIndex] = newData;
    } else {
      db.push(newData);
    }
    writeDB(db);

    res.json({ 
      title: pageTitle, 
      content: finalContent, 
      url,
      filesFound: docLinks.size,
      filesProcessed: finalDocLinks.length,
      subPagesScanned: limitedSubPages.length
    });
  } catch (err) {
    console.error('[SCRAPE ERROR]', err.message);
    res.status(500).json({ error: `Không thể tải trang: ${err.message}` });
  }
});

// ============================================================
// Route: Chat với Gemini API
// ============================================================
app.post('/chat', async (req, res) => {
  const { apiKey, history, context, message } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Thiếu Gemini API Key' });
  }
  if (!message) {
    return res.status(400).json({ error: 'Thiếu nội dung tin nhắn' });
  }

  try {
    let systemInstruction = 'Bạn là một trợ lý AI thân thiện, hữu ích và thông minh. Hãy trả lời bằng tiếng Việt trừ khi người dùng yếu cầu khác.\n\nHãy sử dụng nội dung từ tài liệu hỗ trợ được cung cấp bên dưới để trả lời câu hỏi của người dùng một cách chính xác nhất. Nếu thông tin không có trong tài liệu, bạn vẫn có thể sử dụng kiến thức chung của mình nhưng hãy ưu tiên dữ liệu thực tế từ trang web.';

    let currentContext = context;
    let dbContextFound = false;

    // 1. Phân tích context hiện tại (nếu có từ tin nhắn hiện tại)
    if (currentContext && currentContext.content && currentContext.content.trim()) {
      systemInstruction += `\n\n=== NỘI DUNG TRANG HIỆN TẠI ===\nURL: ${currentContext.url}\nTiêu đề: ${currentContext.title}\n\n${currentContext.content}\n=== HẾT NGUỒN HIỆN TẠI ===`;
      dbContextFound = true;
    }

    // 2. Tìm kiếm thông minh trong Database (RAG)
    const db = readDB();
    if (db.length > 0) {
      const stopWords = new Set(['là', 'của', 'và', 'cho', 'tôi', 'muốn', 'biết', 'về', 'có', 'không', 'như', 'thế', 'nào', 'với', 'ở', 'tại', 'trường', 'đại', 'học']);
      const userMsgLower = message.toLowerCase();
      const keywords = userMsgLower.split(/[\s,.;:!?]+/).filter(k => k.length > 1 && !stopWords.has(k));

      if (keywords.length > 0) {
        const scoredDocs = db.map(item => {
          // Tránh gộp lại trang hiện tại đã có ở bước 1
          if (currentContext && item.url === currentContext.url) return { ...item, score: 0 };

          const title = (item.title || '').toLowerCase();
          const content = (item.content || '').toLowerCase();
          let score = 0;
          
          keywords.forEach(kw => {
            // Title match trọng số cao (5 điểm)
            if (title.includes(kw)) score += 5;
            // Content match (1 điểm mỗi lần xuất hiện)
            const occurrences = (content.split(kw).length - 1);
            score += Math.min(occurrences, 20); // Giới hạn điểm nội dung mỗi từ khóa để tránh spam
          });
          return { ...item, score };
        });

        const topMatches = scoredDocs
          .filter(doc => doc.score > 2) // Ngưỡng điểm tối thiểu
          .sort((a, b) => b.score - a.score)
          .slice(0, 4); // Lấy tối đa 4 trang liên quan nhất trong DB

        if (topMatches.length > 0) {
          console.log(`📌 RAG: Đã gộp thêm ${topMatches.length} tài liệu từ CSDL vào ngữ cảnh.`);
          systemInstruction += `\n\n=== DỮ LIỆU LIÊN QUAN TỪ CSDL ===`;
          topMatches.forEach((doc, idx) => {
            systemInstruction += `\n\n[TÀI LIỆU ${idx + 1}]\nTiêu đề: ${doc.title}\nURL: ${doc.url}\nNội dung:\n${doc.content.substring(0, 10000)}\n--- END TÀI LIỆU ${idx + 1} ---`;
          });
          dbContextFound = true;
        }
      }
    }

    if (!dbContextFound) {
      systemInstruction += '\n\n(Lưu ý: Hiện chưa có dữ liệu cụ thể từ trang web này hoặc CSDL, hãy trả lời dựa trên kiến thức chung của bạn).';
    }

    // Xây dựng lịch sử hội thoại
    const contents = [];

    if (history && history.length > 0) {
      for (const msg of history) {
        contents.push({
          role: msg.role,
          parts: [{ text: msg.text }],
        });
      }
    }

    // Thêm tin nhắn hiện tại
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: 30000,
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || `HTTP ${geminiRes.status}`;
      throw new Error(errMsg);
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      throw new Error('Gemini không trả về nội dung hợp lệ');
    }

    res.json({ reply });
  } catch (err) {
    console.error('[CHAT ERROR]', err.message);
    res.status(500).json({ error: `Lỗi Gemini API: ${err.message}` });
  }
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Chatbox server đang chạy tại: http://localhost:${PORT}`);
});
