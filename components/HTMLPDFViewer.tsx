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
      width?: number;
      height?: number;
      dir?: string;
    }>;
  }>;
  getAnnotations: () => Promise<any[]>;
}

// Extend existing window interface instead of redefining
interface PDFLib {
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
}

interface PDFViewerProps {}

const HTMLPDFViewer: React.FC<PDFViewerProps> = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [renderMode, setRenderMode] = useState<'html' | 'canvas'>('html');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionFormat, setConversionFormat] = useState<'png' | 'jpeg'>(
    'png'
  );
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

  // Helper function to extract color from PDF operations
  const extractTextColor = (operatorList: any): string => {
    try {
      // Look for color setting operations in the PDF
      const ops = operatorList.fnArray;
      const args = operatorList.argsArray;

      let currentColor = '#000000'; // Default black

      for (let i = 0; i < ops.length; i++) {
        // PDF.js operator codes for color setting
        if (ops[i] === 82 || ops[i] === 84) {
          // setFillColor operations
          const colorArgs = args[i];
          if (colorArgs && colorArgs.length >= 3) {
            // Convert RGB values (0-1) to hex
            const r = Math.round(colorArgs[0] * 255);
            const g = Math.round(colorArgs[1] * 255);
            const b = Math.round(colorArgs[2] * 255);
            currentColor = `rgb(${r}, ${g}, ${b})`;
          }
        }
      }

      return currentColor;
    } catch (error) {
      return '#000000'; // Default to black if color extraction fails
    }
  };

  // Render page as HTML elements with improved text handling
  const renderPageAsHTML = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !containerRef.current) return;

      try {
        containerRef.current.innerHTML = '';

        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const textContent = await page.getTextContent();

        // Get annotations for highlights and colors
        let annotations: any[] = [];
        try {
          annotations = await page.getAnnotations();
        } catch (error) {
          console.warn('Could not load annotations:', error);
        }

        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.style.cssText = `
          position: relative;
          width: ${viewport.width}px;
          height: ${viewport.height}px;
          margin: 20px auto;
          background: white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          border: 1px solid #e0e0e0;
          overflow: hidden;
          user-select: text;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Render background canvas for images and graphics (but hide text)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        `;

        // Custom render context to hide text from canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          renderInteractiveForms: false,
          // This option helps reduce text rendering on canvas
          textLayerMode: 0,
        };

        // Render the page but intercept text operations
        try {
          const renderTask = page.render(renderContext);
          await renderTask.promise;
        } catch (renderError) {
          console.warn('Render error:', renderError);
          // Fallback: render normally if custom rendering fails
          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;
        }

        pageContainer.appendChild(canvas);

        // Create HTML text layer with better color detection
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

        // Get operator list to extract colors
        let operatorList: any = null;
        try {
          operatorList = await (page as any).getOperatorList();
        } catch (error) {
          console.warn(
            'Could not get operator list for color extraction:',
            error
          );
        }

        // Process text items and create HTML elements with color preservation
        textContent.items.forEach((item: any, index: number) => {
          if (!item.str.trim()) return;

          const textElement = document.createElement('div');
          textElement.textContent = item.str;

          // Calculate position and size from transform matrix
          const transform = item.transform;
          const x = transform[4];
          const y = viewport.height - transform[5]; // PDF coordinates are bottom-up
          const scaleX = Math.abs(transform[0]);
          const scaleY = Math.abs(transform[3]);
          const fontSize = Math.max(scaleY, 8); // Minimum font size

          // Try to extract color information
          let textColor = '#000000'; // Default black

          // Check if there are annotations that might affect this text
          annotations.forEach((annotation) => {
            if (annotation.subtype === 'Highlight' && annotation.color) {
              // Check if text is within highlight bounds
              const annotRect = annotation.rect;
              if (annotRect && annotRect.length >= 4) {
                const [x1, y1, x2, y2] = annotRect;
                const textX = x;
                const textY = viewport.height - y;

                if (textX >= x1 && textX <= x2 && textY >= y1 && textY <= y2) {
                  // Text is within highlight area
                  if (annotation.color && annotation.color.length >= 3) {
                    const [r, g, b] = annotation.color;
                    textColor = `rgb(${Math.round(r * 255)}, ${Math.round(
                      g * 255
                    )}, ${Math.round(b * 255)})`;
                  }
                }
              }
            }
          });

          // If we have operator list, try to extract text color from it
          if (operatorList && !textColor.includes('rgb')) {
            textColor = extractTextColor(operatorList);
          }

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
            color: ${textColor};
            transform-origin: left top;
            ${scaleX !== scaleY ? `transform: scaleX(${scaleX / scaleY});` : ''}
            background: transparent;
            border: none;
            margin: 0;
            padding: 0;
          `;

          textLayer.appendChild(textElement);
        });

        // Add highlight overlays from annotations
        annotations.forEach((annotation) => {
          if (annotation.subtype === 'Highlight' && annotation.rect) {
            const [x1, y1, x2, y2] = annotation.rect;
            const highlightElement = document.createElement('div');

            let backgroundColor = 'rgba(255, 255, 0, 0.3)'; // Default yellow
            if (annotation.color && annotation.color.length >= 3) {
              const [r, g, b] = annotation.color;
              backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(
                g * 255
              )}, ${Math.round(b * 255)}, 0.3)`;
            }

            highlightElement.style.cssText = `
              position: absolute;
              left: ${x1}px;
              top: ${viewport.height - y2}px;
              width: ${x2 - x1}px;
              height: ${y2 - y1}px;
              background-color: ${backgroundColor};
              z-index: 1;
              pointer-events: none;
            `;

            textLayer.appendChild(highlightElement);
          }
        });

        pageContainer.appendChild(textLayer);
        containerRef.current.appendChild(pageContainer);
      } catch (err) {
        console.error('Error rendering HTML page:', err);
        setError('Failed to render PDF page as HTML');
      }
    },
    [pdfDoc, scale]
  );

  // Render page with canvas (original method)
  const renderPageAsCanvas = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !containerRef.current) return;

      try {
        containerRef.current.innerHTML = '';

        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const textContent = await page.getTextContent();

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          border: 1px solid #e0e0e0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

        // Create text layer
        const textLayerDiv = document.createElement('div');
        textLayerDiv.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: ${viewport.width}px;
          height: ${viewport.height}px;
          font-size: 1px;
          line-height: 1;
          transform-origin: 0% 0%;
          z-index: 2;
        `;

        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.style.cssText = `
          position: relative;
          width: ${viewport.width}px;
          height: ${viewport.height}px;
          margin: 20px auto;
          background: white;
        `;

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayerDiv);
        containerRef.current.appendChild(pageContainer);

        // Render canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        await page.render(renderContext).promise;

        // Render text layer
        textContent.items.forEach((item: any) => {
          const textDiv = document.createElement('div');
          textDiv.textContent = item.str;
          textDiv.style.cssText = `
            position: absolute;
            white-space: pre;
            color: transparent;
            user-select: text;
            cursor: text;
            left: ${item.transform[4]}px;
            bottom: ${item.transform[5]}px;
            font-size: ${Math.sqrt(
              item.transform[0] * item.transform[0] +
                item.transform[1] * item.transform[1]
            )}px;
            font-family: ${item.fontName || 'sans-serif'};
          `;
          textLayerDiv.appendChild(textDiv);
        });
      } catch (err) {
        console.error('Error rendering canvas page:', err);
        setError('Failed to render PDF page');
      }
    },
    [pdfDoc, scale]
  );

  // Main render function
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (renderMode === 'html') {
        await renderPageAsHTML(pageNumber);
      } else {
        await renderPageAsCanvas(pageNumber);
      }
    },
    [renderMode, renderPageAsHTML, renderPageAsCanvas]
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
    setScale((prev) => Math.max(prev - 0.2, 0.3));
  };

  // Convert current page to image for download
  const downloadPageAsImage = useCallback(async () => {
    if (!pdfDoc) return;

    try {
      setIsConverting(true);
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 2 }); // High resolution
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${
              pdfFile?.name?.replace('.pdf', '') || 'page'
            }_page_${currentPage}.${conversionFormat}`;
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
      console.error('Error converting page:', error);
      setError('Failed to convert page to image');
    } finally {
      setIsConverting(false);
    }
  }, [pdfDoc, currentPage, pdfFile?.name, conversionFormat]);

  return (
    <div className='flex h-screen bg-gray-100'>
      {/* Left Panel - Controls (30%) */}
      <div className='w-[30%] bg-white border-r border-gray-300 p-6 flex flex-col overflow-y-auto'>
        <h2 className='text-2xl font-bold mb-6 text-gray-800'>
          Enhanced PDF Viewer
        </h2>

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

        {/* Render Mode Selection */}
        {pdfDoc && (
          <div className='space-y-4 mb-6'>
            <div>
              <label className='text-sm text-gray-600 mb-2 block'>
                Render Mode:
              </label>
              <select
                value={renderMode}
                onChange={(e) =>
                  setRenderMode(e.target.value as 'html' | 'canvas')
                }
                className='w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500'
              >
                <option value='html'>HTML Mode (Clean text + colors)</option>
                <option value='canvas'>Canvas Mode (Traditional)</option>
              </select>
              <p className='text-xs text-gray-500 mt-1'>
                {renderMode === 'html'
                  ? 'Clean text selection with color preservation'
                  : 'Traditional canvas rendering'}
              </p>
            </div>
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

            {/* Image Export */}
            <div className='border-t pt-4 space-y-3'>
              <h3 className='font-semibold text-gray-800'>Export Options</h3>

              <div className='space-y-2'>
                <label className='text-sm text-gray-600'>Image Format:</label>
                <select
                  value={conversionFormat}
                  onChange={(e) =>
                    setConversionFormat(e.target.value as 'png' | 'jpeg')
                  }
                  className='w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500'
                >
                  <option value='png'>PNG</option>
                  <option value='jpeg'>JPEG</option>
                </select>
              </div>

              <button
                onClick={downloadPageAsImage}
                disabled={isConverting}
                className='w-full px-3 py-2 bg-green-500 text-white rounded disabled:bg-gray-300 hover:bg-green-600 transition-colors'
              >
                {isConverting ? 'Converting...' : 'Download as Image'}
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
