'use client';

import { useState, createContext, useContext, useEffect } from 'react';
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

// Dark Mode Context
interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(
  undefined
);

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
};

const PDFViewerHome: React.FC = () => {
  const [viewerMode, setViewerMode] = useState<ViewerMode>('single');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Apply dark mode class to document root
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (isDarkMode) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const ModeSelector = () => (
    <div
      className={`${
        isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      } border-b p-4 shadow-sm transition-colors duration-200`}
    >
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <h1
          className={`text-2xl font-bold ${
            isDarkMode ? 'text-gray-100' : 'text-gray-800'
          }`}
        >
          PDF Viewer
        </h1>

        <div className='flex items-center space-x-6'>
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
              {isDarkMode ? (
                <path
                  fillRule='evenodd'
                  d='M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z'
                  clipRule='evenodd'
                />
              ) : (
                <path d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z' />
              )}
            </svg>
            <span className='text-sm font-medium'>
              {isDarkMode ? 'Light' : 'Dark'}
            </span>
          </button>

          <div className='flex items-center space-x-4'>
            <span
              className={`text-sm font-medium ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              Viewing Mode:
            </span>
            <div
              className={`flex ${
                isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
              } rounded-lg p-1`}
            >
              <button
                onClick={() => setViewerMode('single')}
                className={`
                px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
                ${
                  viewerMode === 'single'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : isDarkMode
                    ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-600'
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
                    : isDarkMode
                    ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-600'
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
      </div>

      {/* Mode Description */}
      <div className='max-w-7xl mx-auto mt-4'>
        <div
          className={`${
            isDarkMode ? 'bg-gray-800' : 'bg-gray-50'
          } rounded-lg p-4 transition-colors duration-200`}
        >
          {viewerMode === 'single' ? (
            <div className='flex items-start space-x-3'>
              <div className='w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0'></div>
              <div>
                <h3
                  className={`font-medium ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-800'
                  } mb-1`}
                >
                  Single Page Mode
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
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
                <h3
                  className={`font-medium ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-800'
                  } mb-1`}
                >
                  Scrollable Mode
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
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
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      <div
        className={`h-screen flex flex-col ${
          isDarkMode ? 'bg-gray-900' : 'bg-gray-100'
        } transition-colors duration-200`}
      >
        <ModeSelector />

        <div className='flex-1 overflow-hidden'>
          {viewerMode === 'single' ? (
            <SinglePagePDFViewer />
          ) : (
            <ScrollablePDFViewer />
          )}
        </div>
      </div>
    </DarkModeContext.Provider>
  );
};

export default PDFViewerHome;
