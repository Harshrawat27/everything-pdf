'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useDarkMode } from './PDFViewerHome';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// PDF options for better text support
const options = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

// Type definitions
interface PDFFile extends File {
  type: 'application/pdf';
}

interface OutlineItem {
  title: string;
  bold?: boolean;
  italic?: boolean;
  color?: number[] | Uint8ClampedArray;
  dest?: string | any[] | null;
  url?: string | null;
  unsafeUrl?: string;
  newWindow?: boolean;
  count?: number;
  items?: OutlineItem[];
}

// Custom PDF Page Component
const PDFPageComponent = ({
  pageNumber,
  scale,
  containerWidth,
  onLoadSuccess,
  isDarkMode,
}: {
  pageNumber: number;
  scale: number;
  containerWidth: number;
  onLoadSuccess?: (page: any) => void;
  isDarkMode?: boolean;
}) => {
  const [pageWidth, setPageWidth] = useState<number | null>(null);

  // Calculate responsive scale
  const calculateScale = useCallback(() => {
    if (!pageWidth || !containerWidth) return scale;

    const maxWidth = containerWidth - 32; // Account for padding
    const responsiveScale = Math.min(scale, maxWidth / pageWidth);
    return Math.max(responsiveScale, 0.3); // Minimum scale
  }, [scale, pageWidth, containerWidth]);

  const handlePageLoadSuccess = useCallback(
    (page: any) => {
      const viewport = page.getViewport({ scale: 1 });
      setPageWidth(viewport.width);
      onLoadSuccess?.(page);
    },
    [onLoadSuccess]
  );

  return (
    <div 
      className='pdf-page-wrapper mb-4 md:mb-8 mx-auto max-w-full'
      style={{
        filter: isDarkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
      }}
    >
      <div className='relative'>
        <Page
          pageNumber={pageNumber}
          scale={calculateScale()}
          onLoadSuccess={handlePageLoadSuccess}
          className={`pdf-page shadow-lg border mx-auto ${
            isDarkMode 
              ? 'border-gray-600 bg-black' 
              : 'border-gray-200 bg-white'
          }`}
          canvasBackground={isDarkMode ? 'black' : 'white'}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
        
        {/* Restore images from inversion in dark mode */}
        {isDarkMode && (
          <style>{`
            .pdf-page img,
            .pdf-page [data-element-type="image"] {
              filter: invert(1) hue-rotate(180deg) !important;
            }
          `}</style>
        )}
      </div>
    </div>
  );
};

// Outline/Bookmark component
const OutlineComponent = ({
  outline,
  onItemClick,
  level = 0,
}: {
  outline: OutlineItem[];
  onItemClick: (item: OutlineItem) => void;
  level?: number;
}) => {
  return (
    <div className={`outline-container ${level > 0 ? 'ml-4' : ''}`}>
      {outline.map((item, index) => (
        <div key={index} className='outline-item'>
          <button
            onClick={() => onItemClick(item)}
            className={`
              w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm transition-colors
              ${item.bold ? 'font-bold' : ''}
              ${item.italic ? 'italic' : ''}
              ${level === 0 
                ? 'font-medium text-gray-800 dark:text-gray-200' 
                : 'text-gray-600 dark:text-gray-400'
              }
            `}
            style={{
              paddingLeft: `${8 + level * 16}px`,
              color: item.color
                ? Array.isArray(item.color)
                  ? `rgb(${item.color.join(',')})`
                  : item.color instanceof Uint8ClampedArray
                  ? `rgb(${Array.from(item.color).join(',')})`
                  : undefined
                : undefined,
            }}
          >
            {item.title}
          </button>
          {item.items && item.items.length > 0 && (
            <OutlineComponent
              outline={item.items}
              onItemClick={onItemClick}
              level={level + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
};

// Main PDF Viewer Component
const ReactPDFViewer: React.FC = () => {
  const { isDarkMode } = useDarkMode();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [containerWidth, setContainerWidth] = useState(800);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [activeTab, setActiveTab] = useState<'navigation' | 'outline'>(
    'navigation'
  );
  const [pdfDocument, setPdfDocument] = useState<any>(null);

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
    const handleResize = () => {
      checkMobile();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update container width when sidebar opens/closes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mainContentRef.current) {
        const rect = mainContentRef.current.getBoundingClientRect();
        setContainerWidth(rect.width);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [sidebarOpen]);

  const onDocumentLoadSuccess = useCallback(
    async ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setCurrentPage(1);
      setIsLoading(false);
      setError(null);

      // Get the PDF document proxy to access outline
      try {
        if (pdfFile) {
          // Convert File to ArrayBuffer for pdfjs
          const arrayBuffer = await pdfFile.arrayBuffer();
          const doc = await pdfjs.getDocument(arrayBuffer).promise;
          setPdfDocument(doc);

          if (doc) {
            const outline = await doc.getOutline();
            if (outline) {
              // Type assertion to handle the outline structure
              setOutline(outline as OutlineItem[]);

              // If we have an outline, show the outline tab by default
              if (outline.length > 0) {
                setActiveTab('outline');
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not load PDF outline:', err);
      }
    },
    [pdfFile]
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setError(
      'Failed to load the PDF file. It might be corrupted or unsupported.'
    );
    setIsLoading(false);
  }, []);

  // Handle internal link clicks
  const handleItemClick = useCallback(
    async (item: any) => {
      if (!pdfDocument) return;

      try {
        let targetPageNumber = null;

        // Handle different types of destinations
        if (item.dest) {
          if (Array.isArray(item.dest)) {
            // Direct destination array
            if (
              item.dest[0] &&
              typeof item.dest[0] === 'object' &&
              item.dest[0].num
            ) {
              // Reference to a page object
              const pageRef = item.dest[0];
              targetPageNumber = (await pdfDocument.getPageIndex(pageRef)) + 1;
            } else if (typeof item.dest[0] === 'number') {
              // Direct page number (0-based)
              targetPageNumber = item.dest[0] + 1;
            }
          } else if (typeof item.dest === 'string') {
            // Named destination
            try {
              const namedDest = await pdfDocument.getDestination(item.dest);
              if (namedDest && namedDest[0]) {
                if (typeof namedDest[0] === 'object' && namedDest[0].num) {
                  const pageRef = namedDest[0];
                  targetPageNumber =
                    (await pdfDocument.getPageIndex(pageRef)) + 1;
                } else if (typeof namedDest[0] === 'number') {
                  targetPageNumber = namedDest[0] + 1;
                }
              }
            } catch (err) {
              console.warn(
                'Could not resolve named destination:',
                item.dest,
                err
              );
            }
          }
        }

        // Navigate to the target page
        if (
          targetPageNumber &&
          targetPageNumber >= 1 &&
          targetPageNumber <= (numPages || 1)
        ) {
          setCurrentPage(targetPageNumber);

          // Close sidebar on mobile after navigation
          if (isMobile) {
            setSidebarOpen(false);
          }
        } else {
          console.warn('Could not determine target page for item:', item);
        }
      } catch (err) {
        console.error('Error handling item click:', err);
      }
    },
    [pdfDocument, numPages, isMobile]
  );

  // Handle external URLs
  const handleExternalLink = useCallback((url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // Enhanced onItemClick handler for the Document component
  const onDocumentItemClick = useCallback(
    ({ dest, url }: { dest?: any; url?: string }) => {
      if (url) {
        handleExternalLink(url);
      } else if (dest) {
        handleItemClick({ dest });
      }
    },
    [handleItemClick, handleExternalLink]
  );

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please select a valid PDF file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setNumPages(null);
    setOutline(null);
    setPdfDocument(null);
    setPdfFile(file);
    setCurrentPage(1);
    setActiveTab('navigation');
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.3));
  const resetZoom = () => setScale(1.2);

  const goToPage = (pageNum: number) => {
    if (pageNum >= 1 && pageNum <= (numPages || 1)) {
      setCurrentPage(pageNum);
    }
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  return (
    <div className={`flex flex-col md:flex-row h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} font-sans transition-colors duration-200`}>
      {/* Mobile Header */}
      {isMobile && (
        <header className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b p-4 flex justify-between items-center md:hidden transition-colors`}>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>PDF Viewer</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded transition ${
              isDarkMode 
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
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
        bg-white border-r border-gray-200 p-4 md:p-6 flex flex-col shadow-md overflow-y-auto
        ${isMobile ? 'top-16' : ''}
      `}
      >
        {/* Desktop title */}
        {!isMobile && (
          <h1 className='text-2xl font-bold mb-6 text-gray-800'>PDF Viewer</h1>
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

        {/* File Upload */}
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

        {/* File Info */}
        {pdfFile && (
          <div className='bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200'>
            <h3 className='font-semibold text-blue-900 mb-2'>Current File:</h3>
            <p className='text-sm text-blue-800 break-all'>{pdfFile.name}</p>
            {numPages && (
              <p className='text-xs text-blue-600 mt-1'>
                {numPages} {numPages > 1 ? 'pages' : 'page'}
              </p>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        {numPages && (
          <div className='mb-4'>
            <div className='flex border-b border-gray-200'>
              <button
                onClick={() => setActiveTab('navigation')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'navigation'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Navigation
              </button>
              {outline && outline.length > 0 && (
                <button
                  onClick={() => setActiveTab('outline')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'outline'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Bookmarks
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab Content */}
        {numPages && activeTab === 'navigation' && (
          <div className='space-y-4 mb-6'>
            {/* Page Navigation */}
            <div>
              <label className='text-sm font-medium text-gray-600 mb-2 block'>
                Page Navigation
              </label>
              <div className='flex items-center space-x-2 mb-3'>
                <button
                  onClick={prevPage}
                  disabled={currentPage <= 1}
                  className='p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  ←
                </button>
                <span className='text-sm font-medium px-3 py-2 bg-gray-100 rounded'>
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={nextPage}
                  disabled={currentPage >= numPages}
                  className='p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  →
                </button>
              </div>

              {/* Page Jump */}
              <input
                type='number'
                min={1}
                max={numPages}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className='w-full p-2 border border-gray-300 rounded text-center'
                placeholder='Go to page...'
              />
            </div>

            {/* Zoom Controls */}
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

        {/* Outline/Bookmarks Tab */}
        {numPages && activeTab === 'outline' && outline && (
          <div className='flex-1 overflow-y-auto'>
            <div className='text-sm font-medium text-gray-600 mb-3'>
              Table of Contents
            </div>
            <OutlineComponent outline={outline} onItemClick={handleItemClick} />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mt-4 text-sm'>
            <p>{error}</p>
          </div>
        )}

        {/* Features Info */}
        {!pdfFile && (
          <div className='mt-auto pt-6 text-xs text-gray-500'>
            <p className='mb-2'>✓ Internal link navigation</p>
            <p className='mb-2'>✓ Bookmark/outline support</p>
            <p className='mb-2'>✓ Text selection enabled</p>
            <p className='mb-2'>✓ Responsive design</p>
            <p>✓ High-quality rendering</p>
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
          bg-gray-200 overflow-y-auto
          ${isMobile ? 'pt-0' : ''}
        `}
      >
        <div className='flex flex-col items-center w-full min-h-full p-4 md:p-8'>
          {isLoading && (
            <div className='flex items-center justify-center h-64'>
              <div className='text-lg text-gray-600'>Loading PDF...</div>
            </div>
          )}

          {!pdfFile && !isLoading && (
            <div className='flex items-center justify-center h-full w-full text-center text-gray-500'>
              <div>
                <h2 className='text-xl font-semibold mb-2'>No PDF Loaded</h2>
                <p className='text-sm md:text-base'>
                  Upload a PDF file to begin viewing
                </p>
                <p className='text-xs mt-2 text-gray-400'>
                  Supports internal links, bookmarks, text selection, and
                  responsive viewing
                </p>
              </div>
            </div>
          )}

          {pdfFile && (
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              onItemClick={onDocumentItemClick}
              options={options}
              loading={
                <div className='flex items-center justify-center h-64'>
                  <div className='text-lg text-gray-600'>Loading PDF...</div>
                </div>
              }
              error={
                <div className='flex items-center justify-center h-64'>
                  <div className='text-lg text-red-600'>Failed to load PDF</div>
                </div>
              }
              className='react-pdf-document'
            >
              {numPages && (
                <PDFPageComponent
                  pageNumber={currentPage}
                  scale={scale}
                  containerWidth={containerWidth}
                  isDarkMode={isDarkMode}
                />
              )}
            </Document>
          )}

          {/* Page Navigation Footer */}
          {numPages && numPages > 1 && (
            <div className='mt-6 flex items-center justify-center space-x-4 bg-white p-4 rounded-lg shadow-md'>
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className='px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm'
              >
                First
              </button>
              <button
                onClick={prevPage}
                disabled={currentPage <= 1}
                className='px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Previous
              </button>
              <span className='text-sm font-medium px-4 py-1 bg-blue-100 text-blue-800 rounded'>
                {currentPage} of {numPages}
              </span>
              <button
                onClick={nextPage}
                disabled={currentPage >= numPages}
                className='px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Next
              </button>
              <button
                onClick={() => goToPage(numPages)}
                disabled={currentPage === numPages}
                className='px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm'
              >
                Last
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ReactPDFViewer;
