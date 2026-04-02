import { NextResponse } from 'next/server';

const PROMPT = `
SYSTEM: STRICT DOCUMENT EXTRACTION ENGINE (ZERO HALLUCINATION)

INPUT:
- 1 hoặc nhiều ảnh

MỤC TIÊU:
Trích xuất toàn bộ nội dung nhìn thấy và chuyển thành markdown

NGUYÊN TẮC:
- CHỈ dùng dữ liệu trong ảnh
- KHÔNG suy luận
- KHÔNG thêm nội dung
- Nếu không rõ → [unclear]

XỬ LÝ:
- OCR text (in + viết tay)
- Nhận diện cấu trúc:
  + văn bản
  + danh sách
  + bảng
  + sơ đồ
  + ma trận

CHUYỂN ĐỔI:

- Văn bản → giữ nguyên
- Danh sách → bullet
- Bảng → markdown table
- Flow → A → B → C
- Ma trận:

### Biểu đồ
- Hàng 1: ...
- Hàng 2: ...

- Ghi chú → giữ nguyên

OUTPUT:
- Markdown sạch
- Không giải thích
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
