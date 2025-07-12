'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// PDF options for better text support
const options = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

// Custom PDF Page Component with hover and selection
const PDFPageComponent = ({
  pageNumber,
  scale,
  containerWidth,
}: {
  pageNumber: number;
  scale: number;
  containerWidth: number;
}) => {
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Calculate responsive scale
  const calculateScale = useCallback(() => {
    if (!pageWidth || !containerWidth) return scale;

    const maxWidth = containerWidth - 32; // Account for padding
    const responsiveScale = Math.min(scale, maxWidth / pageWidth);
    return Math.max(responsiveScale, 0.3); // Minimum scale
  }, [scale, pageWidth, containerWidth]);

  const onPageLoadSuccess = useCallback((page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageWidth(viewport.width);
  }, []);

  // Add hover and selection functionality after page loads
  useEffect(() => {
    const pageElement = pageRef.current;
    if (!pageElement) return;

    const setupTextInteractions = () => {
      // Find all text elements in the text layer
      const textLayer = pageElement.querySelector(
        '.react-pdf__Page__textContent'
      );
      if (!textLayer) return;

      const textElements = textLayer.querySelectorAll('span');

      // Group spans into paragraphs based on their vertical position
      const paragraphs = groupSpansIntoParagraphs(textElements);

      // Create paragraph wrappers and add interactions
      paragraphs.forEach((spanGroup, index) => {
        // Create a wrapper div for the paragraph
        const paragraphWrapper = document.createElement('div');
        paragraphWrapper.className = 'pdf-paragraph-wrapper';
        paragraphWrapper.style.position = 'absolute';
        paragraphWrapper.style.cursor = 'text';
        paragraphWrapper.style.transition = 'all 0.2s ease-in-out';
        paragraphWrapper.style.borderRadius = '4px';
        paragraphWrapper.style.padding = '2px 4px';
        paragraphWrapper.style.margin = '1px';
        paragraphWrapper.style.zIndex = '10';
        paragraphWrapper.style.pointerEvents = 'auto';

        // Calculate bounding box for the paragraph
        const bounds = calculateParagraphBounds(spanGroup);
        paragraphWrapper.style.left = `${bounds.left}px`;
        paragraphWrapper.style.top = `${bounds.top}px`;
        paragraphWrapper.style.width = `${bounds.width}px`;
        paragraphWrapper.style.height = `${bounds.height}px`;

        // Mouse enter event
        const handleMouseEnter = () => {
          paragraphWrapper.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          paragraphWrapper.style.transform = 'scale(1.01)';
          paragraphWrapper.style.boxShadow =
            '0 2px 8px rgba(59, 130, 246, 0.2)';

          // Highlight all spans in this paragraph
          spanGroup.forEach((span) => {
            span.style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
          });
        };

        // Mouse leave event
        const handleMouseLeave = () => {
          if (!paragraphWrapper.classList.contains('selected-paragraph')) {
            paragraphWrapper.style.backgroundColor = 'transparent';
            paragraphWrapper.style.transform = 'scale(1)';
            paragraphWrapper.style.boxShadow = 'none';

            // Remove highlight from spans
            spanGroup.forEach((span) => {
              span.style.backgroundColor = 'transparent';
            });
          }
        };

        // Click event for selection
        const handleClick = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();

          // Remove selection from all other paragraphs
          const allParagraphWrappers = textLayer.querySelectorAll(
            '.pdf-paragraph-wrapper'
          );
          allParagraphWrappers.forEach((wrapper) => {
            if (wrapper !== paragraphWrapper) {
              wrapper.classList.remove('selected-paragraph');
              (wrapper as HTMLElement).style.backgroundColor = 'transparent';
              (wrapper as HTMLElement).style.transform = 'scale(1)';
              (wrapper as HTMLElement).style.boxShadow = 'none';
            }
          });

          // Remove highlight from all spans
          textElements.forEach((span) => {
            span.style.backgroundColor = 'transparent';
          });

          // Toggle selection on clicked paragraph
          const isSelected =
            paragraphWrapper.classList.contains('selected-paragraph');

          if (isSelected) {
            paragraphWrapper.classList.remove('selected-paragraph');
            paragraphWrapper.style.backgroundColor = 'transparent';
            paragraphWrapper.style.transform = 'scale(1)';
            paragraphWrapper.style.boxShadow = 'none';

            spanGroup.forEach((span) => {
              span.style.backgroundColor = 'transparent';
            });

            window.getSelection()?.removeAllRanges();
          } else {
            paragraphWrapper.classList.add('selected-paragraph');
            paragraphWrapper.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            paragraphWrapper.style.transform = 'scale(1.01)';
            paragraphWrapper.style.boxShadow =
              '0 3px 12px rgba(59, 130, 246, 0.3)';

            // Highlight all spans in the selected paragraph
            spanGroup.forEach((span) => {
              span.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
            });

            // Select all text in the paragraph
            const selection = window.getSelection();
            selection?.removeAllRanges();

            if (spanGroup.length > 0) {
              const range = document.createRange();
              range.setStartBefore(spanGroup[0]);
              range.setEndAfter(spanGroup[spanGroup.length - 1]);
              selection?.addRange(range);
            }
          }
        };

        // Add event listeners
        paragraphWrapper.addEventListener('mouseenter', handleMouseEnter);
        paragraphWrapper.addEventListener('mouseleave', handleMouseLeave);
        paragraphWrapper.addEventListener('click', handleClick);

        // Store cleanup function
        (paragraphWrapper as any)._cleanup = () => {
          paragraphWrapper.removeEventListener('mouseenter', handleMouseEnter);
          paragraphWrapper.removeEventListener('mouseleave', handleMouseLeave);
          paragraphWrapper.removeEventListener('click', handleClick);
        };

        // Insert the wrapper into the text layer
        textLayer.appendChild(paragraphWrapper);
      });
    };

    // Helper function to group spans into paragraphs
    const groupSpansIntoParagraphs = (spans: NodeListOf<Element>) => {
      const spansArray = Array.from(spans) as HTMLElement[];
      const paragraphs: HTMLElement[][] = [];

      if (spansArray.length === 0) return paragraphs;

      // Sort spans by their vertical position (top), then horizontal position (left)
      spansArray.sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();

        // If they're on roughly the same line (within 10px), sort by left position
        if (Math.abs(aRect.top - bRect.top) < 10) {
          return aRect.left - bRect.left;
        }

        return aRect.top - bRect.top;
      });

      let currentParagraph: HTMLElement[] = [spansArray[0]];
      let lastBottom = spansArray[0].getBoundingClientRect().bottom;

      for (let i = 1; i < spansArray.length; i++) {
        const span = spansArray[i];
        const rect = span.getBoundingClientRect();

        // If there's a significant vertical gap (more than 1.5x line height), start a new paragraph
        const lineHeight = rect.height;
        const gap = rect.top - lastBottom;

        if (gap > lineHeight * 0.8) {
          // Start new paragraph
          paragraphs.push(currentParagraph);
          currentParagraph = [span];
        } else {
          // Add to current paragraph
          currentParagraph.push(span);
        }

        lastBottom = Math.max(lastBottom, rect.bottom);
      }

      // Don't forget the last paragraph
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
      }

      return paragraphs;
    };

    // Helper function to calculate paragraph bounds
    const calculateParagraphBounds = (spans: HTMLElement[]) => {
      if (spans.length === 0) return { left: 0, top: 0, width: 0, height: 0 };

      const rects = spans.map((span) => span.getBoundingClientRect());
      const containerRect = pageRef.current?.getBoundingClientRect();

      if (!containerRect) return { left: 0, top: 0, width: 0, height: 0 };

      const left = Math.min(...rects.map((r) => r.left)) - containerRect.left;
      const top = Math.min(...rects.map((r) => r.top)) - containerRect.top;
      const right = Math.max(...rects.map((r) => r.right)) - containerRect.left;
      const bottom =
        Math.max(...rects.map((r) => r.bottom)) - containerRect.top;

      return {
        left: left - 4, // Add some padding
        top: top - 2,
        width: right - left + 8,
        height: bottom - top + 4,
      };
    };

    // Setup interactions after a short delay to ensure text layer is rendered
    const timer = setTimeout(setupTextInteractions, 500);

    return () => {
      clearTimeout(timer);
      // Cleanup event listeners and paragraph wrappers
      const textLayer = pageElement.querySelector(
        '.react-pdf__Page__textContent'
      );
      if (textLayer) {
        const paragraphWrappers = textLayer.querySelectorAll(
          '.pdf-paragraph-wrapper'
        );
        paragraphWrappers.forEach((wrapper) => {
          if ((wrapper as any)._cleanup) {
            (wrapper as any)._cleanup();
          }
          wrapper.remove();
        });
      }
    };
  }, [pageNumber, scale]); // Re-run when page or scale changes

  return (
    <div
      ref={pageRef}
      className='pdf-page-wrapper mb-4 md:mb-8 mx-auto max-w-full'
    >
      <Page
        pageNumber={pageNumber}
        scale={calculateScale()}
        onLoadSuccess={onPageLoadSuccess}
        className='pdf-page shadow-lg border border-gray-200 mx-auto'
        canvasBackground='white'
        renderTextLayer={true}
        renderAnnotationLayer={true}
      />
    </div>
  );
};

// Main PDF Viewer Component
const ReactPDFViewer: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [containerWidth, setContainerWidth] = useState(800);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
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

  // Add global click handler to deselect paragraphs when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is outside of paragraph wrappers
      if (
        !target.closest('.pdf-paragraph-wrapper') &&
        !target.closest('.react-pdf__Page__textContent')
      ) {
        // Remove selection from all paragraph wrappers
        const allParagraphWrappers = document.querySelectorAll(
          '.pdf-paragraph-wrapper.selected-paragraph'
        );
        allParagraphWrappers.forEach((wrapper) => {
          wrapper.classList.remove('selected-paragraph');
          (wrapper as HTMLElement).style.backgroundColor = 'transparent';
          (wrapper as HTMLElement).style.transform = 'scale(1)';
          (wrapper as HTMLElement).style.boxShadow = 'none';
        });

        // Remove highlight from all text spans
        const allTextSpans = document.querySelectorAll(
          '.react-pdf__Page__textContent span'
        );
        allTextSpans.forEach((span) => {
          (span as HTMLElement).style.backgroundColor = 'transparent';
        });

        // Clear browser selection
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setCurrentPage(1);
      setIsLoading(false);
      setError(null);
    },
    []
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setError(
      'Failed to load the PDF file. It might be corrupted or unsupported.'
    );
    setIsLoading(false);
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please select a valid PDF file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setNumPages(null);
    setPdfFile(file);
    setCurrentPage(1);
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
        bg-white border-r border-gray-200 p-4 md:p-6 flex flex-col shadow-md overflow-y-auto
        ${isMobile ? 'top-16' : ''}
      `}
      >
        {/* Desktop title */}
        {!isMobile && (
          <h1 className='text-2xl font-bold mb-6 text-gray-800'>
            Interactive PDF Viewer
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

        {/* Navigation Controls */}
        {numPages && (
          <div className='space-y-4 mb-6'>
            <div>
              <label className='text-sm font-medium text-gray-600 mb-2 block'>
                Page Navigation
              </label>
              <div className='flex items-center space-x-2'>
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
            </div>

            {/* Page Jump */}
            <div>
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
          </div>
        )}

        {/* Zoom Controls */}
        {numPages && (
          <div className='space-y-4'>
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

        {/* Error Display */}
        {error && (
          <div className='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mt-4 text-sm'>
            <p>{error}</p>
          </div>
        )}

        {/* Features Info */}
        <div className='mt-auto pt-6 text-xs text-gray-500'>
          <p className='mb-2'>✓ Interactive hover effects</p>
          <p className='mb-2'>✓ Click to select text</p>
          <p className='mb-2'>✓ Responsive design</p>
          <p className='mb-2'>✓ Annotation support</p>
          <p>✓ High-quality rendering</p>
        </div>
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
                  Hover over text to see animations, click to select
                </p>
              </div>
            </div>
          )}

          {pdfFile && (
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
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
