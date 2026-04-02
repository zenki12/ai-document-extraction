'use client';

import { useState, useRef } from 'react';

export default function DocumentExtractor() {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (images.length + files.length > 20) {
      setError('Tối đa chỉ được upload 20 ảnh một lần (1 Batch). Vui lòng chia thành nhiều Batch.');
      return;
    }

    setError(null);
    setResult(null);

    const compressImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            // Nén ảnh xuống chất lượng 80% để giảm size
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
      });
    };

    try {
      const compressedImages = await Promise.all(files.map(compressImage));
      setImages((prev) => [...prev, ...compressedImages]);
    } catch (err) {
      setError('Lỗi khi nén và xử lý ảnh.');
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    if (images.length <= 1) {
      setResult(null);
    }
  };

  const handleExtract = async () => {
    if (images.length === 0) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });

      let data;
      const textResponse = await response.text();
      try {
        data = JSON.parse(textResponse);
      } catch (parseError) {
        if (textResponse.includes('Request Entity Too Large') || response.status === 413) {
          throw new Error('DUNG LƯỢNG QUÁ TẢI (413): Vercel từ chối vì ảnh sau nén vẫn > 4.5MB. Vui lòng thử 5-7 ảnh/lần.');
        }
        if (textResponse.includes('504') || response.status === 504 || textResponse.includes('Gateway Timeout')) {
          throw new Error('HẾT THỜI GIAN CHỜ (504): Quá trình phân tích AI mất nhiều hơn 10 giây nên Vercel đã tự động ngắt kết nối. Vui lòng test với 1-2 ảnh trước.');
        }
        throw new Error(`SERER ERROR: Phản hồi không phải JSON. Có thể Vercel đang lỗi mạng. (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.details ? `Lỗi từ Gemini: ${data.details}` : data.error || 'Có lỗi xảy ra khi xử lý.');
      }

      setResult(data.markdown);
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối Server.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      alert('Đã copy!');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl w-full space-y-8 bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
        <div className="text-center pb-4 border-b border-gray-200">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            RAG Document Extraction
          </h1>
          <p className="mt-4 text-gray-600 text-sm max-w-2xl mx-auto">
            Upload tối đa 20 ảnh scan/tài liệu. App sẽ convert nội dung thành markdown có cấu trúc để bạn dùng cho knowledge base local / RAG.
          </p>
        </div>

        {/* Upload Section */}
        <div className="space-y-4">
          <div 
            className="flex justify-center border-2 border-dashed border-gray-300 rounded-xl px-6 py-12 hover:border-indigo-400 transition-colors cursor-pointer bg-gray-50 hover:bg-gray-100"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div className="mt-4 flex text-sm text-gray-600 justify-center">
                <span className="relative font-medium text-indigo-600 hover:text-indigo-500">
                  Click to upload
                </span>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">Lưu ý rủi ro: Nếu ảnh mờ hoặc mất nét, kết quả có thể chứa [unclear]</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png, image/jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Preview Images */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-6">
              {images.map((src, idx) => (
                <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm aspect-square bg-gray-100">
                  <img src={src} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                    className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Process Button & Error */}
        <div className="flex flex-col items-center pt-4 space-y-4">
          {error && (
            <div className="w-full text-red-600 text-sm font-medium bg-red-50 p-4 rounded-xl border border-red-200 text-center animate-pulse">
              ⚠️ {error}
            </div>
          )}
          
          <button
            onClick={handleExtract}
            disabled={images.length === 0 || loading}
            className={`
              relative px-8 py-3.5 rounded-xl font-bold text-white shadow-md transition-all duration-300
              ${images.length === 0 
                ? 'bg-gray-300 cursor-not-allowed shadow-none' 
                : loading 
                  ? 'bg-indigo-400 cursor-wait' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg transform hover:-translate-y-0.5'
              }
            `}
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing...</span>
              </span>
            ) : (
              'Extract via Gemini'
            )}
          </button>
        </div>

        {/* Result Markdown */}
        {result && (
          <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">Kết quả Extracted</h2>
              <button 
                onClick={copyToClipboard}
                className="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors font-medium shadow-sm border-b"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                <span>Copy Markdown</span>
              </button>
            </div>
            <div className="p-0">
              <textarea
                readOnly
                value={result}
                className="w-full h-80 p-5 bg-gray-50 text-sm font-mono text-gray-800 focus:outline-none resize-y border-none"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
