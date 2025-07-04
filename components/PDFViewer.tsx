'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Type definitions for PDF.js
interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (options: { scale: number }) => any;
  render: (renderContext: any) => { promise: Promise<void> };
  getTextContent: () => Promise<{
    items: Array<{
      str: string;
      transform: number[];
      fontName?: string;
      hasEOL?: boolean;
    }>;
  }>;
}

declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (src: Uint8Array) => { promise: Promise<PDFDocumentProxy> };
      GlobalWorkerOptions: {
        workerSrc: string;
      };
      renderTextLayer?: (options: {
        textContent: any;
        container: HTMLElement;
        viewport: any;
        textDivs: any[];
      }) => void;
    };
  }
}

interface PDFViewerProps {}

const PDFViewer: React.FC<PDFViewerProps> = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionFormat, setConversionFormat] = useState<'png' | 'jpeg'>(
    'png'
  );
  const [conversionQuality, setConversionQuality] = useState(0.92);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add CSS for text layer
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .textLayer {
        position: absolute;
        text-align: initial;
        inset: 0;
        overflow: hidden;
        opacity: 0.25;
        line-height: 1;
        text-size-adjust: none;
        forced-color-adjust: none;
        transform-origin: 0 0;
        caret-color: CanvasText;
      }
      
      .textLayer span,
      .textLayer br {
        color: transparent;
        position: absolute;
        white-space: pre;
        cursor: text;
        transform-origin: 0% 0%;
      }
      
      .textLayer span.markedContent {
        top: 0;
        height: 0;
      }
      
      .textLayer .highlight {
        margin: -1px;
        padding: 1px;
        background-color: rgba(180, 0, 170, 0.2);
        border-radius: 4px;
      }
      
      .textLayer .highlight.appended {
        position: initial;
      }
      
      .textLayer .highlight.begin {
        border-radius: 4px 0 0 4px;
      }
      
      .textLayer .highlight.end {
        border-radius: 0 4px 4px 0;
      }
      
      .textLayer .highlight.middle {
        border-radius: 0;
      }
      
      .textLayer .highlight.selected {
        background-color: rgba(0, 100, 0, 0.2);
      }
      
      .textLayer ::selection {
        background: rgba(0, 0, 255, 0.3);
      }
      
      .textLayer br::selection {
        background: transparent;
      }
      
      .textLayer .endOfContent {
        display: block;
        position: absolute;
        inset: 100% 0 0;
        z-index: -1;
        cursor: default;
        user-select: none;
      }
      
      .textLayer .endOfContent.active {
        top: 0;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      try {
        // Load PDF.js and text layer renderer
        const script1 = document.createElement('script');
        script1.src =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.min.mjs';
        script1.type = 'module';

        const script2 = document.createElement('script');
        script2.src =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf_viewer.min.mjs';
        script2.type = 'module';

        script1.onload = () => {
          script2.onload = () => {
            if (window.pdfjsLib) {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.worker.min.mjs';
              setPdfJsLoaded(true);
            }
          };
          document.head.appendChild(script2);
        };

        script1.onerror = script2.onerror = () => {
          setError('Failed to load PDF library');
        };

        document.head.appendChild(script1);

        // Alternative method: Load via dynamic import with proper error handling
        try {
          const pdfjsLib = await eval(
            `import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.min.mjs')`
          );
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.worker.min.mjs';
          window.pdfjsLib = pdfjsLib;
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

      try {
        const fileReader = new FileReader();
        fileReader.onload = async function (e) {
          if (!e.target?.result) {
            setError('Failed to read file');
            setIsLoading(false);
            return;
          }

          const typedArray = new Uint8Array(e.target.result as ArrayBuffer);

          const pdf = await window.pdfjsLib.getDocument(typedArray).promise;
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setCurrentPage(1);
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

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !containerRef.current) return;

      try {
        // Clear previous content
        containerRef.current.innerHTML = '';

        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });

        // Create canvas for background
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';

        // Create text layer div
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.position = 'absolute';
        textLayerDiv.style.top = '0';
        textLayerDiv.style.left = '0';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.fontSize = '1px';
        textLayerDiv.style.lineHeight = '1';
        textLayerDiv.style.transformOrigin = '0% 0%';

        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.style.position = 'relative';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;
        pageContainer.style.margin = '0 auto';
        pageContainer.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        pageContainer.style.backgroundColor = 'white';

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayerDiv);
        containerRef.current.appendChild(pageContainer);

        // Render the canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        await page.render(renderContext).promise;

        // Render the text layer
        const textContent = await page.getTextContent();

        // Create text layer using PDF.js built-in text layer
        if (window.pdfjsLib && (window.pdfjsLib as any).renderTextLayer) {
          (window.pdfjsLib as any).renderTextLayer({
            textContent: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: [],
          });
        } else {
          // Fallback: manual text layer creation
          textContent.items.forEach((item: any) => {
            const textDiv = document.createElement('div');
            textDiv.textContent = item.str;
            textDiv.style.position = 'absolute';
            textDiv.style.whiteSpace = 'pre';
            textDiv.style.color = 'transparent';
            textDiv.style.userSelect = 'text';
            textDiv.style.cursor = 'text';

            // Transform matrix for positioning
            const transform = item.transform;
            const x = transform[4];
            const y = transform[5];
            const fontSize = Math.sqrt(
              transform[0] * transform[0] + transform[1] * transform[1]
            );

            textDiv.style.left = `${x}px`;
            textDiv.style.bottom = `${y}px`;
            textDiv.style.fontSize = `${fontSize}px`;
            textDiv.style.fontFamily = item.fontName || 'sans-serif';

            textLayerDiv.appendChild(textDiv);
          });
        }
      } catch (err) {
        console.error('Error rendering page:', err);
        setError('Failed to render PDF page');
      }
    },
    [pdfDoc, scale]
  );

  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

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
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  // Convert single page to image
  const convertPageToImage = useCallback(
    async (pageNumber: number, downloadScale: number = 2) => {
      if (!pdfDoc) return;

      try {
        setIsConverting(true);
        const page = await pdfDoc.getPage(pageNumber);

        // Create a higher resolution canvas for conversion
        const viewport = page.getViewport({ scale: downloadScale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Convert canvas to blob
        return new Promise<string>((resolve) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                resolve(url);
              }
            },
            `image/${conversionFormat}`,
            conversionFormat === 'jpeg' ? conversionQuality : undefined
          );
        });
      } catch (error) {
        console.error('Error converting page to image:', error);
        setError('Failed to convert page to image');
        return null;
      } finally {
        setIsConverting(false);
      }
    },
    [pdfDoc, conversionFormat, conversionQuality]
  );

  // Download single page as image
  const downloadCurrentPageAsImage = useCallback(async () => {
    const imageUrl = await convertPageToImage(currentPage);
    if (imageUrl) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${
        pdfFile?.name?.replace('.pdf', '') || 'page'
      }_page_${currentPage}.${conversionFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(imageUrl);
    }
  }, [convertPageToImage, currentPage, pdfFile?.name, conversionFormat]);

  // Convert all pages to images and download as ZIP
  const downloadAllPagesAsImages = useCallback(async () => {
    if (!pdfDoc || !totalPages) return;

    try {
      setIsConverting(true);

      // We'll create a simple approach - download each page separately
      // For a ZIP file, you'd need to add a ZIP library like JSZip
      for (let i = 1; i <= totalPages; i++) {
        const imageUrl = await convertPageToImage(i);
        if (imageUrl) {
          const link = document.createElement('a');
          link.href = imageUrl;
          link.download = `${
            pdfFile?.name?.replace('.pdf', '') || 'document'
          }_page_${i.toString().padStart(3, '0')}.${conversionFormat}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(imageUrl);

          // Add a small delay between downloads to avoid overwhelming the browser
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error('Error converting all pages:', error);
      setError('Failed to convert all pages to images');
    } finally {
      setIsConverting(false);
    }
  }, [pdfDoc, totalPages, convertPageToImage, pdfFile?.name, conversionFormat]);

  // Convert and preview current page
  const previewCurrentPageAsImage = useCallback(async () => {
    const imageUrl = await convertPageToImage(currentPage);
    if (imageUrl) {
      // Open in new tab for preview
      window.open(imageUrl, '_blank');
    }
  }, [convertPageToImage, currentPage]);

  return (
    <div className='flex h-screen bg-gray-100'>
      {/* Left Panel - Upload Section (30%) */}
      <div className='w-[30%] bg-white border-r border-gray-300 p-6 flex flex-col'>
        <h2 className='text-2xl font-bold mb-6 text-gray-800'>PDF Viewer</h2>

        {/* Upload Area */}
        <div
          className='border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer mb-6'
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className='text-gray-500'>
            <svg
              className='w-12 h-12 mx-auto mb-4'
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
            <p className='text-lg mb-2'>Click to upload or drag & drop</p>
            <p className='text-sm'>PDF files only</p>
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
              {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}

        {/* Controls */}
        {pdfDoc && (
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <span className='text-sm text-gray-600'>Page:</span>
              <span className='text-sm font-medium'>
                {currentPage} of {totalPages}
              </span>
            </div>

            <div className='flex gap-2'>
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className='flex-1 px-3 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors'
              >
                Previous
              </button>
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className='flex-1 px-3 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors'
              >
                Next
              </button>
            </div>

            <div className='flex items-center justify-between'>
              <span className='text-sm text-gray-600'>Zoom:</span>
              <span className='text-sm font-medium'>
                {Math.round(scale * 100)}%
              </span>
            </div>

            <div className='flex gap-2'>
              <button
                onClick={zoomOut}
                className='flex-1 px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
              >
                Zoom Out
              </button>
              <button
                onClick={zoomIn}
                className='flex-1 px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
              >
                Zoom In
              </button>
            </div>

            {/* Image Conversion Section */}
            <div className='border-t pt-4 space-y-4'>
              <h3 className='font-semibold text-gray-800'>Convert to Image</h3>

              {/* Format Selection */}
              <div className='space-y-2'>
                <label className='text-sm text-gray-600'>Format:</label>
                <select
                  value={conversionFormat}
                  onChange={(e) =>
                    setConversionFormat(e.target.value as 'png' | 'jpeg')
                  }
                  className='w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500'
                >
                  <option value='png'>PNG (Lossless)</option>
                  <option value='jpeg'>JPEG (Smaller size)</option>
                </select>
              </div>

              {/* Quality Selection for JPEG */}
              {conversionFormat === 'jpeg' && (
                <div className='space-y-2'>
                  <label className='text-sm text-gray-600'>
                    Quality: {Math.round(conversionQuality * 100)}%
                  </label>
                  <input
                    type='range'
                    min='0.1'
                    max='1'
                    step='0.1'
                    value={conversionQuality}
                    onChange={(e) =>
                      setConversionQuality(parseFloat(e.target.value))
                    }
                    className='w-full'
                  />
                </div>
              )}

              {/* Conversion Buttons */}
              <div className='space-y-2'>
                <button
                  onClick={previewCurrentPageAsImage}
                  disabled={isConverting}
                  className='w-full px-3 py-2 bg-green-500 text-white rounded disabled:bg-gray-300 hover:bg-green-600 transition-colors'
                >
                  {isConverting ? 'Converting...' : 'Preview Current Page'}
                </button>

                <button
                  onClick={downloadCurrentPageAsImage}
                  disabled={isConverting}
                  className='w-full px-3 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors'
                >
                  {isConverting ? 'Converting...' : 'Download Current Page'}
                </button>

                <button
                  onClick={downloadAllPagesAsImages}
                  disabled={isConverting}
                  className='w-full px-3 py-2 bg-purple-500 text-white rounded disabled:bg-gray-300 hover:bg-purple-600 transition-colors'
                >
                  {isConverting
                    ? 'Converting...'
                    : `Download All ${totalPages} Pages`}
                </button>
              </div>

              <div className='text-xs text-gray-500 space-y-1'>
                <p>• Preview opens image in new tab</p>
                <p>• Downloads use 2x resolution for quality</p>
                <p>• All pages downloads each page separately</p>
              </div>
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

      {/* Right Panel - PDF Display (70%) */}
      <div className='w-[70%] bg-gray-50 flex flex-col'>
        <div className='flex-1 overflow-auto p-6'>
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

          {pdfDoc && (
            <div
              ref={containerRef}
              className='flex justify-center'
              style={{ userSelect: 'text' }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
