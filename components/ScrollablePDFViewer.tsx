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

// Individual PDF Page Component for scrollable view
const ScrollablePDFPage = ({
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

  const calculateScale = useCallback(() => {
    if (!pageWidth || !containerWidth) return scale;
    const maxWidth = containerWidth - 32;
    const responsiveScale = Math.min(scale, maxWidth / pageWidth);
    return Math.max(responsiveScale, 0.3);
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
      className='pdf-page-wrapper mb-6 mx-auto max-w-full'
      id={`page-${pageNumber}`}
      style={{
        filter: isDarkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
      }}
    >
      <div className='relative'>
        {/* Page number indicator */}
        <div className={`absolute -top-6 left-0 text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
          Page {pageNumber}
        </div>

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
          
          {/* Add a CSS class for image restoration in dark mode */}
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

// Page Navigation Component
const PageNavigator = ({
  numPages,
  currentVisiblePage,
  onPageClick,
}: {
  numPages: number;
  currentVisiblePage: number;
  onPageClick: (page: number) => void;
}) => {
  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (
      let i = Math.max(2, currentVisiblePage - delta);
      i <= Math.min(numPages - 1, currentVisiblePage + delta);
      i++
    ) {
      range.push(i);
    }

    if (currentVisiblePage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentVisiblePage + delta < numPages - 1) {
      rangeWithDots.push('...', numPages);
    } else if (numPages > 1) {
      rangeWithDots.push(numPages);
    }

    return rangeWithDots;
  };

  return (
    <div className='flex items-center justify-center space-x-1 flex-wrap'>
      {getVisiblePages().map((page, index) => (
        <button
          key={index}
          onClick={() =>
            typeof page === 'number' ? onPageClick(page) : undefined
          }
          disabled={typeof page !== 'number'}
          className={`
            px-3 py-1 text-sm rounded transition-colors
            ${
              typeof page === 'number'
                ? page === currentVisiblePage
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-transparent text-gray-400 cursor-default'
            }
          `}
        >
          {page}
        </button>
      ))}
    </div>
  );
};

// Main Scrollable PDF Viewer Component
const ScrollablePDFViewer: React.FC = () => {
  const { isDarkMode } = useDarkMode();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [containerWidth, setContainerWidth] = useState(800);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [activeTab, setActiveTab] = useState<'navigation' | 'outline'>(
    'navigation'
  );
  const [pdfDocument, setPdfDocument] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer to track visible pages
  useEffect(() => {
    if (!scrollContainerRef.current || !numPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visiblePages = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => parseInt(entry.target.id.split('-')[1]))
          .sort((a, b) => a - b);

        if (visiblePages.length > 0) {
          setCurrentVisiblePage(visiblePages[0]);
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.5,
        rootMargin: '-50px 0px -50px 0px',
      }
    );

    // Observe all page elements
    const pageElements =
      scrollContainerRef.current.querySelectorAll('[id^="page-"]');
    pageElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [numPages]);

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
    }, 300);

    return () => clearTimeout(timer);
  }, [sidebarOpen]);

  const onDocumentLoadSuccess = useCallback(
    async ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setCurrentVisiblePage(1);
      setIsLoading(false);
      setError(null);

      // Get the PDF document proxy to access outline
      try {
        if (pdfFile) {
          const arrayBuffer = await pdfFile.arrayBuffer();
          const doc = await pdfjs.getDocument(arrayBuffer).promise;
          setPdfDocument(doc);

          if (doc) {
            const outline = await doc.getOutline();
            if (outline) {
              setOutline(outline as OutlineItem[]);

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

  // Scroll to specific page
  const scrollToPage = useCallback((pageNumber: number) => {
    const pageElement = document.getElementById(`page-${pageNumber}`);
    if (pageElement && scrollContainerRef.current) {
      pageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    }
  }, []);

  // Handle internal link clicks
  const handleItemClick = useCallback(
    async (item: any) => {
      if (!pdfDocument) return;

      try {
        let targetPageNumber = null;

        if (item.dest) {
          if (Array.isArray(item.dest)) {
            if (
              item.dest[0] &&
              typeof item.dest[0] === 'object' &&
              item.dest[0].num
            ) {
              const pageRef = item.dest[0];
              targetPageNumber = (await pdfDocument.getPageIndex(pageRef)) + 1;
            } else if (typeof item.dest[0] === 'number') {
              targetPageNumber = item.dest[0] + 1;
            }
          } else if (typeof item.dest === 'string') {
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

        if (
          targetPageNumber &&
          targetPageNumber >= 1 &&
          targetPageNumber <= (numPages || 1)
        ) {
          scrollToPage(targetPageNumber);

          if (isMobile) {
            setSidebarOpen(false);
          }
        }
      } catch (err) {
        console.error('Error handling item click:', err);
      }
    },
    [pdfDocument, numPages, isMobile, scrollToPage]
  );

  const handleExternalLink = useCallback((url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

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
    setCurrentVisiblePage(1);
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

  return (
    <div className={`flex flex-col md:flex-row h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} font-sans transition-colors duration-200`}>
      {/* Mobile Header */}
      {isMobile && (
        <header className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b p-4 flex justify-between items-center md:hidden transition-colors duration-200`}>
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            Scrollable PDF Viewer
          </h1>
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
        ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
        border-r p-4 md:p-6 flex flex-col shadow-md overflow-y-auto transition-colors duration-200
        ${isMobile ? 'top-16' : ''}
      `}
      >
        {/* Desktop title */}
        {!isMobile && (
          <h1 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            Scrollable PDF Viewer
          </h1>
        )}

        {/* Close button for mobile */}
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className={`self-end p-2 mb-4 rounded transition md:hidden ${
              isDarkMode 
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            ✕
          </button>
        )}

        {/* File Upload */}
        <div
          className={`border-2 border-dashed rounded-xl p-4 md:p-6 text-center hover:border-blue-500 transition-colors cursor-pointer mb-6 ${
            isDarkMode 
              ? 'border-gray-600 bg-gray-700' 
              : 'border-gray-300 bg-gray-50'
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDragDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <p className={`text-base md:text-lg mb-2 font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            Upload PDF
          </p>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Click or Drag & Drop</p>
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

        {/* Current Page Indicator */}
        {numPages && (
          <div className='bg-green-50 p-3 rounded-lg mb-4 border border-green-200'>
            <div className='text-sm font-medium text-green-800'>
              Currently Viewing: Page {currentVisiblePage} of {numPages}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        {numPages && (
          <div className='mb-4'>
            <div className={`flex border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <button
                onClick={() => setActiveTab('navigation')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'navigation'
                    ? 'border-blue-500 text-blue-600'
                    : `border-transparent ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
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
                      : `border-transparent ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
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
            {/* Quick Navigation */}
            <div>
              <label className={`text-sm font-medium mb-2 block ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Quick Navigation
              </label>
              <div className='grid grid-cols-2 gap-2 mb-3'>
                <button
                  onClick={() => scrollToPage(1)}
                  className={`p-2 rounded transition text-sm ${
                    isDarkMode 
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  First Page
                </button>
                <button
                  onClick={() => scrollToPage(numPages)}
                  className={`p-2 rounded transition text-sm ${
                    isDarkMode 
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Last Page
                </button>
              </div>

              {/* Go to specific page */}
              <input
                type='number'
                min={1}
                max={numPages}
                placeholder='Go to page...'
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const page = parseInt((e.target as HTMLInputElement).value);
                    if (page >= 1 && page <= numPages) {
                      scrollToPage(page);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
                className={`w-full p-2 border rounded text-center ${
                  isDarkMode 
                    ? 'border-gray-600 bg-gray-700 text-gray-200 placeholder-gray-400' 
                    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>

            {/* Page Navigator */}
            {numPages > 1 && (
              <div>
                <label className='text-sm font-medium text-gray-600 mb-2 block'>
                  Page Overview
                </label>
                <div className='max-h-32 overflow-y-auto border border-gray-200 rounded p-2'>
                  <PageNavigator
                    numPages={numPages}
                    currentVisiblePage={currentVisiblePage}
                    onPageClick={scrollToPage}
                  />
                </div>
              </div>
            )}

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
            <div className={`text-sm font-medium mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
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
            <p className='mb-2'>✓ Continuous scrolling</p>
            <p className='mb-2'>✓ All pages visible</p>
            <p className='mb-2'>✓ Smart page navigation</p>
            <p className='mb-2'>✓ Internal link support</p>
            <p>✓ Bookmark navigation</p>
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
          ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} overflow-hidden transition-colors duration-200
          ${isMobile ? 'pt-0' : ''}
        `}
      >
        <div ref={scrollContainerRef} className='h-full overflow-y-auto'>
          <div className='flex flex-col items-center w-full min-h-full p-4 md:p-8'>
            {isLoading && (
              <div className='flex items-center justify-center h-64'>
                <div className={`text-lg ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Loading PDF...</div>
              </div>
            )}

            {!pdfFile && !isLoading && (
              <div className={`flex items-center justify-center h-full w-full text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <div>
                  <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>No PDF Loaded</h2>
                  <p className='text-sm md:text-base'>
                    Upload a PDF file to begin scrollable viewing
                  </p>
                  <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    All pages will be displayed in a continuous scroll view
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
                    <div className='text-lg text-red-600'>
                      Failed to load PDF
                    </div>
                  </div>
                }
                className='react-pdf-document w-full'
              >
                {numPages &&
                  Array.from(new Array(numPages), (_, index) => (
                    <ScrollablePDFPage
                      key={`page_${index + 1}`}
                      pageNumber={index + 1}
                      scale={scale}
                      containerWidth={containerWidth}
                      isDarkMode={isDarkMode}
                    />
                  ))}
              </Document>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ScrollablePDFViewer;
