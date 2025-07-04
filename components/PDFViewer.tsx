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
}

declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (src: Uint8Array) => { promise: Promise<PDFDocumentProxy> };
      GlobalWorkerOptions: {
        workerSrc: string;
      };
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
  const [scale, setScale] = useState(1.5);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      try {
        // Create script element for PDF.js
        const script = document.createElement('script');
        script.src =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.min.mjs';
        script.type = 'module';

        script.onload = () => {
          // Set worker source
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.worker.min.mjs';
            setPdfJsLoaded(true);
          }
        };

        script.onerror = () => {
          setError('Failed to load PDF library');
        };

        document.head.appendChild(script);

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
      if (!pdfDoc || !canvasRef.current) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
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
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

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
            <div className='flex justify-center'>
              <canvas
                ref={canvasRef}
                className='border border-gray-300 shadow-lg bg-white max-w-full h-auto'
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
