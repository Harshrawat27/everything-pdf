'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the PDF viewers with no SSR
const SinglePagePDFViewer = dynamic(() => import('./PDFViewerWrapper'), {
  ssr: false,
  loading: () => (
    <div className='flex items-center justify-center h-screen bg-gray-100'>
      <div className='text-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4'></div>
        <p className='text-gray-600'>Loading Single Page Viewer...</p>
      </div>
    </div>
  ),
});

const ScrollablePDFViewer = dynamic(() => import('./ScrollablePDFViewer'), {
  ssr: false,
  loading: () => (
    <div className='flex items-center justify-center h-screen bg-gray-100'>
      <div className='text-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4'></div>
        <p className='text-gray-600'>Loading Scrollable Viewer...</p>
      </div>
    </div>
  ),
});

type ViewerMode = 'single' | 'scrollable';

const PDFViewerHome: React.FC = () => {
  const [viewerMode, setViewerMode] = useState<ViewerMode>('single');

  const ModeSelector = () => (
    <div className='bg-white border-b border-gray-200 p-4 shadow-sm'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <h1 className='text-2xl font-bold text-gray-800'>PDF Viewer</h1>

        <div className='flex items-center space-x-4'>
          <span className='text-sm font-medium text-gray-600'>
            Viewing Mode:
          </span>
          <div className='flex bg-gray-100 rounded-lg p-1'>
            <button
              onClick={() => setViewerMode('single')}
              className={`
                px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
                ${
                  viewerMode === 'single'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                }
              `}
            >
              <div className='flex items-center space-x-2'>
                <svg
                  className='w-4 h-4'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z'
                    clipRule='evenodd'
                  />
                </svg>
                <span>Single Page</span>
              </div>
            </button>

            <button
              onClick={() => setViewerMode('scrollable')}
              className={`
                px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
                ${
                  viewerMode === 'scrollable'
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                }
              `}
            >
              <div className='flex items-center space-x-2'>
                <svg
                  className='w-4 h-4'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z'
                    clipRule='evenodd'
                  />
                </svg>
                <span>Scrollable</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mode Description */}
      <div className='max-w-7xl mx-auto mt-4'>
        <div className='bg-gray-50 rounded-lg p-4'>
          {viewerMode === 'single' ? (
            <div className='flex items-start space-x-3'>
              <div className='w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0'></div>
              <div>
                <h3 className='font-medium text-gray-800 mb-1'>
                  Single Page Mode
                </h3>
                <p className='text-sm text-gray-600'>
                  View one page at a time with navigation controls. Perfect for
                  focused reading and presentations. Features page-by-page
                  navigation, internal link support, and bookmark navigation.
                </p>
              </div>
            </div>
          ) : (
            <div className='flex items-start space-x-3'>
              <div className='w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0'></div>
              <div>
                <h3 className='font-medium text-gray-800 mb-1'>
                  Scrollable Mode
                </h3>
                <p className='text-sm text-gray-600'>
                  View all pages in a continuous scroll. Great for reading long
                  documents and quick navigation. Features smooth scrolling,
                  visible page tracking, and instant bookmark jumping.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className='h-screen flex flex-col bg-gray-100'>
      <ModeSelector />

      <div className='flex-1 overflow-hidden'>
        {viewerMode === 'single' ? (
          <SinglePagePDFViewer />
        ) : (
          <ScrollablePDFViewer />
        )}
      </div>
    </div>
  );
};

export default PDFViewerHome;
