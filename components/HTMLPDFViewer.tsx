'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Type definitions for PDF.js
interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (options: { scale: number }) => any;
  render: (renderContext: {
    canvasContext: CanvasRenderingContext2D | null;
    viewport: any;
  }) => { promise: Promise<void> };
  getTextContent: () => Promise<{
    items: Array<{
      str: string;
      transform: number[];
      fontName?: string;
      hasEOL?: boolean;
      width?: number;
      height?: number;
      dir?: string;
    }>;
  }>;
  getAnnotations: () => Promise<any[]>;
}

interface PDFViewerProps {}

const HTMLPDFViewer: React.FC<PDFViewerProps> = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionFormat, setConversionFormat] = useState<'png' | 'jpeg'>(
    'png'
  );
  const [allPagesRendered, setAllPagesRendered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      try {
        const script = document.createElement('script');
        script.src =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.min.mjs';
        script.type = 'module';

        script.onload = () => {
          if ((window as any).pdfjsLib) {
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.worker.min.mjs';
            setPdfJsLoaded(true);
          }
        };

        script.onerror = () => {
          setError('Failed to load PDF library');
        };

        document.head.appendChild(script);

        try {
          const pdfjsLib = await eval(
            `import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.min.mjs')`
          );
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.worker.min.mjs';
          (window as any).pdfjsLib = pdfjsLib;
          setPdfJsLoaded(true);
        } catch (importError) {
          console.warn(
            'Dynamic import failed, falling back to script tag method'
          );
        }
      } catch (err) {
        console.error('Failed to load PDF.js:', err);
        setError('Failed to load PDF library');
      }
    };

    loadPdfJs();
  }, []);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file) return;

      if (file.type !== 'application/pdf') {
        setError('Please select a PDF file');
        return;
      }

      if (!pdfJsLoaded) {
        setError('PDF library is still loading, please try again');
        return;
      }

      setIsLoading(true);
      setError(null);
      setPdfFile(file);
      setAllPagesRendered(false);

      try {
        const fileReader = new FileReader();
        fileReader.onload = async function (e) {
          if (!e.target?.result) {
            setError('Failed to read file');
            setIsLoading(false);
            return;
          }

          const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
          const pdf = await (window as any).pdfjsLib.getDocument(typedArray)
            .promise;
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setIsLoading(false);
        };

        fileReader.onerror = () => {
          setError('Failed to read file');
          setIsLoading(false);
        };

        fileReader.readAsArrayBuffer(file);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF file');
        setIsLoading(false);
      }
    },
    [pdfJsLoaded]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  // Render a single page as clean HTML
  const renderSinglePageAsHTML = useCallback(
    async (pageNumber: number): Promise<HTMLElement> => {
      if (!pdfDoc) throw new Error('No PDF document loaded');

      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();

      // Create page container
      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page';
      pageContainer.style.cssText = `
        position: relative;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        margin: 0 auto 40px auto;
        background: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border: 1px solid #e0e0e0;
        overflow: hidden;
        user-select: text;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        page-break-after: always;
      `;

      // Add page number indicator
      const pageLabel = document.createElement('div');
      pageLabel.textContent = `Page ${pageNumber}`;
      pageLabel.style.cssText = `
        position: absolute;
        top: -30px;
        left: 0;
        font-size: 12px;
        color: #666;
        background: #f5f5f5;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 500;
      `;
      pageContainer.appendChild(pageLabel);

      // Create text layer
      const textLayer = document.createElement('div');
      textLayer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2;
        pointer-events: auto;
      `;

      // Process text items and create HTML elements
      textContent.items.forEach((item: any, index: number) => {
        if (!item.str.trim()) return;

        const textElement = document.createElement('div');
        textElement.textContent = item.str;
        textElement.className = 'pdf-text-element';
        textElement.dataset.pageNumber = pageNumber.toString();
        textElement.dataset.textIndex = index.toString();

        // Calculate position and size from transform matrix
        const transform = item.transform;
        const x = transform[4];
        const y = viewport.height - transform[5]; // PDF coordinates are bottom-up
        const scaleX = Math.abs(transform[0]);
        const scaleY = Math.abs(transform[3]);
        const fontSize = Math.max(scaleY, 8); // Minimum font size

        textElement.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y - fontSize}px;
          font-size: ${fontSize}px;
          font-family: ${item.fontName || 'Arial, sans-serif'};
          line-height: 1;
          white-space: pre;
          cursor: text;
          user-select: text;
          color: #000;
          transform-origin: left top;
          ${scaleX !== scaleY ? `transform: scaleX(${scaleX / scaleY});` : ''}
          background: transparent;
          border: none;
          margin: 0;
          padding: 2px;
          border-radius: 2px;
          transition: background-color 0.2s ease;
        `;

        // Add hover effects
        textElement.addEventListener('mouseenter', () => {
          textElement.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          textElement.style.outline = '1px solid rgba(59, 130, 246, 0.3)';
        });

        textElement.addEventListener('mouseleave', () => {
          if (!textElement.classList.contains('selected')) {
            textElement.style.backgroundColor = 'transparent';
            textElement.style.outline = 'none';
          }
        });

        // Add click selection
        textElement.addEventListener('click', (e) => {
          e.preventDefault();

          // Remove selection from other elements
          const allTextElements =
            pageContainer.querySelectorAll('.pdf-text-element');
          allTextElements.forEach((el) => {
            el.classList.remove('selected');
            if (el !== textElement) {
              (el as HTMLElement).style.backgroundColor = 'transparent';
              (el as HTMLElement).style.outline = 'none';
            }
          });

          // Select current element
          textElement.classList.add('selected');
          textElement.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
          textElement.style.outline = '2px solid rgba(59, 130, 246, 0.5)';

          // Select the text
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(textElement);
          selection?.removeAllRanges();
          selection?.addRange(range);
        });

        textLayer.appendChild(textElement);
      });

      pageContainer.appendChild(textLayer);
      return pageContainer;
    },
    [pdfDoc, scale]
  );

  // Render all pages in scrollable format
  const renderAllPages = useCallback(async () => {
    if (!pdfDoc || !containerRef.current) return;

    try {
      containerRef.current.innerHTML = '';
      setAllPagesRendered(false);

      // Create a loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #666;">
          <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <p style="margin-top: 16px;">Rendering pages...</p>
        </div>
      `;

      // Add CSS for loading animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      if (!document.head.querySelector('style[data-pdf-viewer]')) {
        style.setAttribute('data-pdf-viewer', 'true');
        document.head.appendChild(style);
      }

      containerRef.current.appendChild(loadingDiv);

      // Render pages progressively
      const fragment = document.createDocumentFragment();

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const pageElement = await renderSinglePageAsHTML(pageNum);
          fragment.appendChild(pageElement);

          // Update loading progress
          loadingDiv.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
              <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <p style="margin-top: 16px;">Rendering page ${pageNum} of ${totalPages}...</p>
            </div>
          `;
        } catch (error) {
          console.error(`Error rendering page ${pageNum}:`, error);

          // Create error placeholder for failed page
          const errorPage = document.createElement('div');
          errorPage.style.cssText = `
            width: 800px;
            height: 200px;
            margin: 0 auto 40px auto;
            background: #fee;
            border: 1px solid #fcc;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #c33;
            font-family: Arial, sans-serif;
          `;
          errorPage.textContent = `Error rendering page ${pageNum}`;
          fragment.appendChild(errorPage);
        }
      }

      // Replace loading with rendered pages
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(fragment);
      setAllPagesRendered(true);
    } catch (err) {
      console.error('Error rendering pages:', err);
      setError('Failed to render PDF pages');
    }
  }, [pdfDoc, totalPages, renderSinglePageAsHTML]);

  // Trigger rendering when PDF is loaded
  useEffect(() => {
    if (pdfDoc && totalPages > 0) {
      renderAllPages();
    }
  }, [pdfDoc, totalPages, renderAllPages]);

  // Re-render when scale changes
  useEffect(() => {
    if (pdfDoc && allPagesRendered) {
      renderAllPages();
    }
  }, [scale, pdfDoc, allPagesRendered, renderAllPages]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        handleFileUpload(file);
      } else {
        setError('Please drop a PDF file');
      }
    }
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.3));
  };

  const resetZoom = () => {
    setScale(1.2);
  };

  // Convert current view to image for download
  const downloadAsImage = useCallback(async () => {
    if (!pdfDoc || !containerRef.current) return;

    try {
      setIsConverting(true);

      // Create a high-resolution canvas for the first page as example
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 2 }); // High resolution
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        setError('Failed to get canvas context');
        return;
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      // Type assertion to handle PDF.js types
      await (page as any).render(renderContext).promise;

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${
              pdfFile?.name?.replace('.pdf', '') || 'document'
            }.${conversionFormat}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        },
        `image/${conversionFormat}`,
        conversionFormat === 'jpeg' ? 0.92 : undefined
      );
    } catch (error) {
      console.error('Error converting to image:', error);
      setError('Failed to convert to image');
    } finally {
      setIsConverting(false);
    }
  }, [pdfDoc, pdfFile?.name, conversionFormat]);

  return (
    <div className='flex h-screen bg-gray-100'>
      {/* Left Panel - Controls (25%) */}
      <div className='w-[25%] bg-white border-r border-gray-300 p-6 flex flex-col overflow-y-auto'>
        <h2 className='text-2xl font-bold mb-6 text-gray-800'>
          HTML PDF Viewer
        </h2>

        {/* Upload Area */}
        <div
          className='border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer mb-6'
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className='text-gray-500'>
            <svg
              className='w-10 h-10 mx-auto mb-3'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
              />
            </svg>
            <p className='text-lg mb-2'>Upload PDF</p>
            <p className='text-sm'>Click or drag & drop</p>
          </div>
          <input
            ref={fileInputRef}
            type='file'
            accept='.pdf'
            onChange={handleFileInputChange}
            className='hidden'
          />
        </div>

        {/* File Info */}
        {pdfFile && (
          <div className='bg-gray-50 p-4 rounded-lg mb-6'>
            <h3 className='font-semibold text-gray-800 mb-2'>Current File:</h3>
            <p className='text-sm text-gray-600 break-all'>{pdfFile.name}</p>
            <p className='text-xs text-gray-500 mt-1'>
              {(pdfFile.size / 1024 / 1024).toFixed(2)} MB • {totalPages} pages
            </p>
          </div>
        )}

        {/* Controls */}
        {pdfDoc && (
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <span className='text-sm text-gray-600'>Zoom:</span>
              <span className='text-sm font-medium'>
                {Math.round(scale * 100)}%
              </span>
            </div>

            <div className='grid grid-cols-3 gap-2'>
              <button
                onClick={zoomOut}
                className='px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm'
              >
                -
              </button>
              <button
                onClick={resetZoom}
                className='px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm'
              >
                Reset
              </button>
              <button
                onClick={zoomIn}
                className='px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm'
              >
                +
              </button>
            </div>

            {/* Export Options */}
            <div className='border-t pt-4 space-y-3'>
              <h3 className='font-semibold text-gray-800'>Export</h3>

              <div className='space-y-2'>
                <label className='text-sm text-gray-600'>Format:</label>
                <select
                  value={conversionFormat}
                  onChange={(e) =>
                    setConversionFormat(e.target.value as 'png' | 'jpeg')
                  }
                  className='w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'
                >
                  <option value='png'>PNG</option>
                  <option value='jpeg'>JPEG</option>
                </select>
              </div>

              <button
                onClick={downloadAsImage}
                disabled={isConverting}
                className='w-full px-3 py-2 bg-green-500 text-white rounded disabled:bg-gray-300 hover:bg-green-600 transition-colors text-sm'
              >
                {isConverting ? 'Converting...' : 'Download as Image'}
              </button>
            </div>

            {/* Instructions */}
            <div className='border-t pt-4 space-y-2'>
              <h3 className='font-semibold text-gray-800 text-sm'>
                How to use:
              </h3>
              <ul className='text-xs text-gray-600 space-y-1'>
                <li>• Scroll to navigate through pages</li>
                <li>• Hover over text to highlight</li>
                <li>• Click to select entire text element</li>
                <li>• Use Ctrl+A to select all text</li>
                <li>• Copy selected text with Ctrl+C</li>
              </ul>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className='bg-red-50 border border-red-200 rounded-lg p-4 mt-4'>
            <p className='text-red-800 text-sm'>{error}</p>
          </div>
        )}
      </div>

      {/* Right Panel - PDF Display (75%) */}
      <div className='w-[75%] bg-gray-50 flex flex-col'>
        <div className='flex-1 overflow-y-auto p-6'>
          {isLoading && (
            <div className='flex items-center justify-center h-full'>
              <div className='text-center'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4'></div>
                <p className='text-gray-600'>Loading PDF...</p>
              </div>
            </div>
          )}

          {!pdfDoc && !isLoading && (
            <div className='flex items-center justify-center h-full'>
              <div className='text-center text-gray-500'>
                <svg
                  className='w-16 h-16 mx-auto mb-4'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                  />
                </svg>
                <p className='text-lg'>No PDF loaded</p>
                <p className='text-sm'>Upload a PDF file to get started</p>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className='min-h-full'
            style={{ userSelect: 'text' }}
          />
        </div>
      </div>
    </div>
  );
};

export default HTMLPDFViewer;
