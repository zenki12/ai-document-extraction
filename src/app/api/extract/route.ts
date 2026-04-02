import { NextResponse } from 'next/server';

// Tăng giới hạn timeout của Vercel (Hobby) lên mức tối đa là 60 giây (Mặc định chỉ có 10s sẽ bị văng)
export const maxDuration = 60;

const PROMPT = `SYSTEM: STRUCTURED DOCUMENT EXTRACTION ENGINE (STRICT + ANTI-RECITATION)

INPUT:
- 1 hoặc nhiều ảnh (có thể gồm văn bản, bảng, sơ đồ, chữ viết tay)

========================
MỤC TIÊU
========================
Trích xuất dữ liệu có cấu trúc từ ảnh để phục vụ phân tích và lưu trữ knowledge.

========================
NGUYÊN TẮC BẮT BUỘC
========================
1. CHỈ sử dụng dữ liệu nhìn thấy trong ảnh
2. KHÔNG:
   - suy luận
   - diễn giải
   - bổ sung kiến thức ngoài
   - tái tạo nguyên văn nội dung dài
3. ƯU TIÊN trích xuất dữ liệu hơn văn bản đầy đủ
4. Nếu ký tự không rõ:
   → ghi: [unclear]
5. Không được bỏ qua dữ liệu quan trọng (bảng, số, ký tự)

========================
XỬ LÝ
========================

BƯỚC 1 – OCR
- Trích xuất:
  + chữ in
  + chữ viết tay
- Giữ nội dung ngắn, không cần chép nguyên đoạn dài

BƯỚC 2 – NHẬN DIỆN CẤU TRÚC

Phân loại:

- Văn bản ngắn
- Danh sách
- Bảng
- Sơ đồ / mũi tên
- Ma trận / grid
- Ghi chú bên cạnh

BƯỚC 3 – CHUYỂN ĐỔI SANG MARKDOWN

QUY TẮC OUTPUT (BẮT BUỘC GIỮ NGUYÊN FORMAT):

1. Bảng:

| Cột | ... |
|-----|-----|

2. Ma trận:

### Biểu đồ

- Hàng 1: ...
- Hàng 2: ...
- Hàng 3: ...

→ Nếu thiếu phần tử:
- vẫn giữ đủ số lượng
- thay bằng [unclear]

3. Sơ đồ:

Flow:
A → B → C

4. Danh sách:
- bullet points

5. Văn bản dài:
→ KHÔNG chép nguyên văn
→ chỉ giữ nội dung ngắn, cần thiết

6. Ghi chú:
→ đặt ngay sau đối tượng liên quan

========================
ỔN ĐỊNH CẤU TRÚC (CRITICAL)
========================

- Không thay đổi format giữa các lần chạy
- Không trả về text tự do
- Luôn giữ shape dữ liệu
- Không bỏ block nếu đọc thiếu

========================
OUTPUT
========================

- Markdown có cấu trúc
- Không giải thích
- Không bình luận
- Không thêm nội dung ngoài ảnh
- Có [unclear] nếu cần

CHỈ TRẢ VỀ KẾT QUẢ`;

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
      ],
      generationConfig: {
        temperature: 1.0
      }
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
    const candidate = data.candidates?.[0];
    const extractedText = candidate?.content?.parts?.[0]?.text || '';

    if (!extractedText) {
      const finishReason = candidate?.finishReason || 'UNKNOWN';
      return NextResponse.json(
        { error: `Gemini không trả về kết quả chữ nào. Lí do của AI (Finish Reason): ${finishReason}. Có thể ảnh chứa nội dung nhạy cảm hoặc bộ phận AI Safety của Google đã chặn. Mời bạn kiểm tra lại nội dung ảnh.` },
        { status: 400 }
      );
    }

    return NextResponse.json({ markdown: extractedText });
  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
