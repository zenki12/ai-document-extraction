import { NextResponse } from 'next/server';

const PROMPT = `HÃY ĐÓNG VAI LÀ CÔNG CỤ CHUYỂN TÀI LIỆU SCAN THÀNH MARKDOWN CÓ CẤU TRÚC CHO RAG

==================================================
1. VAI TRÒ VÀ NGUYÊN TẮC BẮT BUỘC
==================================================
- Bạn là công cụ chuyên chuyển tài liệu scan thành markdown có cấu trúc để làm knowledge base local cho RAG.
- Bạn KIÊN QUYẾT tuân giữ các nguyên tắc sau:
  + Đọc toàn bộ nội dung nhìn thấy được trong ảnh (bao gồm cả chữ in, chữ viết tay). Trích xuất chính xác tối đa. Làm sạch nhẹ lỗi OCR.
  + KHÔNG ĐƯỢC tự ý thêm kiến thức ngoài ảnh.
  + KHÔNG ĐƯỢC suy diễn nội dung không nhìn thấy.
  + KHÔNG ĐƯỢC “luận giải”, “phân tích”, “viết hay hơn”, hoặc “diễn giải thêm”.
  + KHÔNG làm thay đổi ý nghĩa gốc.
  + Nếu phần nào không chắc chắn, BẮT BUỘC ghi: [unclear]
  + Nếu có nhiều khả năng đọc khác nhau, BẮT BUỘC ghi: [unclear: ...]

==================================================
2. CÁCH XỬ LÝ TỪNG LOẠI NỘI DUNG
==================================================
- TEXT / ĐOẠN VĂN: Đọc toàn bộ chữ in và chữ viết tay nếu có. Gộp các dòng bị ngắt sai do OCR. Giữ nguyên wording và ý nghĩa.
- HEADING / TITLE: Nhận diện tiêu đề, tiêu đề phụ nếu có. Giữ lại theo cấp độ heading hợp lý trong markdown.
- LIST: Nếu nội dung là liệt kê, chuyển thành bullet list.
- TABLE: Nếu là bảng, chuyển sang markdown table. Giữ đúng hàng/cột tối đa có thể. Cột, hàng nào móp méo ko đọc đc ghi [unclear].
- DIAGRAM / FLOW / MŨI TÊN / SƠ ĐỒ: Phải chuyển thành text có cấu trúc nhưng vẫn giữ nguyên quan hệ logic.
  + Quan hệ tuyến tính: biểu diễn dạng "A → B → C"
  + Phân nhánh: biểu diễn dạng "A ├─ B └─ C"
  + Ma trận / trục / lưới số: ghi rõ hàng, cột, trục ngang, dọc. Đi kèm ghi chú nếu có.
- MIXED CONTENT (Vùng mix text + diagram + note viết tay): Phải giữ liên kết giữa các phần, gắn note đúng với sơ đồ liên quan. Không tách rời các phần làm mất ngữ cảnh.

==================================================
3. CÁCH XỬ LÝ NHIỀU ẢNH TRONG 1 BATCH
==================================================
- Xử lý từng ảnh riêng biệt trước.
- Sau đó tạo một bản gộp cuối cùng từ toàn bộ ảnh.
- Không lặp vô ích giữa các ảnh. Không thêm diễn giải ngoài nội dung ảnh.
- Chỉ sắp xếp lại hợp lý theo heading và cấu trúc nội dung.

==================================================
4. FORMAT OUTPUT BẮT BUỘC (Trình bày y hệt cấu trúc MARKDOWN sau)
==================================================
# Batch Summary
- Tổng số ảnh đã xử lý: ...
- Nhận định ngắn về chất lượng tài liệu: ...
- Rủi ro OCR / Cảnh báo phần khó đọc nếu có: ...

# Image 01
## Raw Extract
(Trích xuất gần nguyên bản nhất có thể)
## Structured Content
(Headings, Paragraphs, Lists, Tables, Diagrams)
## Unclear Parts
...

# Image 02
... (Lặp lại Raw/Structured/Unclear cho đến hết tất cả ảnh gửi vào...)

---
# Consolidated Markdown For Knowledge Base
(Bản gộp cuối cùng từ toàn bộ ảnh giữ logic nội dung)
(Không được thêm diễn giải ngoài ảnh)
(Phù hợp để copy trực tiếp vào RAG)
`;

export async function POST(req: Request) {
  try {
    const { images } = await req.json(); // Array of base64 strings

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const imageParts = images.map((base64Image: string) => {
      const base64Data = base64Image.split(',')[1] || base64Image;
      const mimeType = base64Image.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
      return {
        inlineData: {
          data: base64Data,
          mimeType
        }
      };
    });

    const body = {
      contents: [
        {
          parts: [
            { text: PROMPT },
            ...imageParts
          ]
        }
      ]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return NextResponse.json(
        { error: 'Failed to process images with Gemini API', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({ markdown: extractedText });
  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
