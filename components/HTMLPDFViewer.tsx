'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// --- Type Definitions for PDF.js ---
interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (options: { scale: number }) => PDFPageViewport;
  render: (renderContext: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }) => RenderTask;
  getTextContent: () => Promise<TextContent>;
}

interface PDFPageViewport {
  width: number;
  height: number;
  scale: number;
}

interface TextContent {
  items: any[];
}

interface RenderTask {
  promise: Promise<void>;
}

// --- PDF Page Component ---
const PDFPage = ({
  pdfDoc,
  pageNumber,
  scale,
  containerWidth,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  containerWidth: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pdfDoc) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);

        // Calculate responsive scale based on container width
        const baseViewport = page.getViewport({ scale: 1.0 });
        const maxWidth = containerWidth - 32; // Account for padding
        const responsiveScale = Math.min(scale, maxWidth / baseViewport.width);

        const viewport = page.getViewport({ scale: responsiveScale });

        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;
        const container = containerRef.current;
        if (!canvas || !textLayer || !container) return;

        // Set the dimensions for the container
        container.style.width = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;

        // Prepare the canvas for high-resolution displays
        canvas.width = viewport.width * window.devicePixelRatio;
        canvas.height = viewport.height * window.devicePixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) return;

        // Scale the canvas context for high-DPI rendering
        canvasContext.scale(window.devicePixelRatio, window.devicePixelRatio);

        // 1. Render the visual page content onto the Canvas
        const renderContext = { canvasContext, viewport };
        await page.render(renderContext).promise;

        // 2. Render the invisible, selectable text layer over the canvas
        const textContent = await page.getTextContent();
        textLayer.innerHTML = ''; // Clear any previous text content

        // Use the PDF.js utility to build the text layer
        (window as any).pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport: viewport,
          textDivs: [],
        });
      } catch (error) {
        console.error(`Failed to render page ${pageNumber}:`, error);
      }
    };

    renderPage();
  }, [pdfDoc, pageNumber, scale, containerWidth]);

  return (
    <div
      ref={containerRef}
      className='pdf-page-container relative bg-white shadow-lg mx-auto mb-4 md:mb-8 border border-gray-200 max-w-full'
    >
      <canvas ref={canvasRef} className='pdf-canvas-layer max-w-full h-auto' />
      <div ref={textLayerRef} className='pdf-text-layer' />
    </div>
  );
};

// --- Main PDF Viewer Component ---
const HTMLPDFViewer: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.5);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Check if mobile and update container width
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (mainContentRef.current) {
        const rect = mainContentRef.current.getBoundingClientRect();
        setContainerWidth(rect.width);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update container width when sidebar opens/closes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mainContentRef.current) {
        const rect = mainContentRef.current.getBoundingClientRect();
        setContainerWidth(rect.width);
      }
    }, 300); // Wait for transition to complete

    return () => clearTimeout(timer);
  }, [sidebarOpen]);

  // Load PDF.js
  useEffect(() => {
    if ((window as any).pdfjsLib) {
      setPdfJsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.innerHTML = `
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.93/pdf.min.mjs';
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = 
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.93/pdf.worker.min.mjs';
    
    window.pdfjsLib = pdfjsLib;
    window.dispatchEvent(new CustomEvent('pdfjsLoaded'));
  `;

    const handlePdfJsLoaded = () => {
      setPdfJsLoaded(true);
      window.removeEventListener('pdfjsLoaded', handlePdfJsLoaded);
    };

    window.addEventListener('pdfjsLoaded', handlePdfJsLoaded);

    script.onerror = () => {
      setError(
        'Failed to load the PDF library script. Please check your network connection.'
      );
      window.removeEventListener('pdfjsLoaded', handlePdfJsLoaded);
    };

    document.head.appendChild(script);

    const textLayerCss = document.createElement('link');
    textLayerCss.rel = 'stylesheet';
    textLayerCss.href =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.93/pdf_viewer.min.css';
    document.head.appendChild(textLayerCss);

    return () => {
      const existingScript = document.querySelector(`script[type="module"]`);
      const existingCSS = document.querySelector(
        `link[href*="pdf_viewer.min.css"]`
      );
      if (existingScript) document.head.removeChild(existingScript);
      if (existingCSS) document.head.removeChild(existingCSS);
      window.removeEventListener('pdfjsLoaded', handlePdfJsLoaded);
    };
  }, []);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file || file.type !== 'application/pdf') {
        setError('Please select a valid PDF file.');
        return;
      }

      if (!pdfJsLoaded) {
        setError('PDF library is still loading, please try again shortly.');
        return;
      }

      setIsLoading(true);
      setError(null);
      setPdfDoc(null);
      setPdfFile(file);

      try {
        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
          if (!e.target?.result) {
            setError('Failed to read file.');
            setIsLoading(false);
            return;
          }

          const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
          const pdf = await (window as any).pdfjsLib.getDocument(typedArray)
            .promise;
          setPdfDoc(pdf);
          setIsLoading(false);
        };
        fileReader.readAsArrayBuffer(file);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load the PDF file. It might be corrupted.');
        setIsLoading(false);
      }
    },
    [pdfJsLoaded]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.4));
  const resetZoom = () => setScale(1.5);

  return (
    <div className='flex flex-col md:flex-row h-screen bg-gray-100 font-sans'>
      {/* Mobile Header */}
      {isMobile && (
        <header className='bg-white border-b border-gray-200 p-4 flex justify-between items-center md:hidden'>
          <h1 className='text-xl font-bold text-gray-800'>PDF Viewer</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className='p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition'
          >
            ☰
          </button>
        </header>
      )}

      {/* Sidebar */}
      <aside
        className={`
        ${
          isMobile
            ? 'fixed inset-y-0 left-0 z-50 w-80 transform transition-transform duration-300 ease-in-out'
            : 'w-[25%] max-w-sm relative'
        }
        ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        bg-white border-r border-gray-200 p-4 md:p-6 flex flex-col shadow-md
        ${isMobile ? 'top-16' : ''}
      `}
      >
        {/* Desktop title */}
        {!isMobile && (
          <h1 className='text-2xl font-bold mb-6 text-gray-800'>
            HTML PDF Viewer
          </h1>
        )}

        {/* Close button for mobile */}
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className='self-end p-2 mb-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition md:hidden'
          >
            ✕
          </button>
        )}

        <div
          className='border-2 border-dashed border-gray-300 rounded-xl p-4 md:p-6 text-center hover:border-blue-500 transition-colors cursor-pointer mb-6 bg-gray-50'
          onDragOver={handleDragOver}
          onDrop={handleDragDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <p className='text-base md:text-lg mb-2 font-semibold text-gray-700'>
            Upload PDF
          </p>
          <p className='text-sm text-gray-500'>Click or Drag & Drop</p>
          <input
            ref={fileInputRef}
            type='file'
            accept='.pdf'
            onChange={handleFileInputChange}
            className='hidden'
          />
        </div>

        {pdfFile && (
          <div className='bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200'>
            <h3 className='font-semibold text-blue-900 mb-2'>Current File:</h3>
            <p className='text-sm text-blue-800 break-all'>{pdfFile.name}</p>
            {pdfDoc && (
              <p className='text-xs text-blue-600 mt-1'>
                {pdfDoc.numPages} {pdfDoc.numPages > 1 ? 'pages' : 'page'}
              </p>
            )}
          </div>
        )}

        {pdfDoc && (
          <div className='space-y-6'>
            <div>
              <div className='flex items-center justify-between mb-2'>
                <label className='text-sm font-medium text-gray-600'>
                  Zoom
                </label>
                <span className='text-sm font-bold text-gray-800'>
                  {Math.round(scale * 100)}%
                </span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                <button
                  onClick={zoomOut}
                  className='p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition'
                >
                  -
                </button>
                <button
                  onClick={resetZoom}
                  className='p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition text-sm'
                >
                  Reset
                </button>
                <button
                  onClick={zoomIn}
                  className='p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition'
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mt-4 text-sm'>
            <p>{error}</p>
          </div>
        )}
      </aside>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className='fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main
        ref={mainContentRef}
        className={`
          ${isMobile ? 'flex-1' : 'w-[75%]'}
          bg-gray-200 overflow-y-auto p-4 md:p-8
          ${isMobile ? 'pt-0' : ''}
        `}
      >
        <div className='flex flex-col items-center w-full'>
          {isLoading && (
            <div className='text-lg text-gray-600'>Loading PDF...</div>
          )}

          {!pdfDoc && !isLoading && (
            <div className='flex items-center justify-center h-full w-full text-center text-gray-500'>
              <div>
                <h2 className='text-xl font-semibold'>No PDF Loaded</h2>
                <p className='text-sm md:text-base'>
                  Please upload a file to begin viewing.
                </p>
              </div>
            </div>
          )}

          {pdfDoc &&
            Array.from(new Array(pdfDoc.numPages), (_, i) => (
              <PDFPage
                key={`page_${i + 1}`}
                pdfDoc={pdfDoc}
                pageNumber={i + 1}
                scale={scale}
                containerWidth={containerWidth}
              />
            ))}
        </div>
      </main>
    </div>
  );
};

export default HTMLPDFViewer;
