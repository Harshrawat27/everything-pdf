// components/PDFViewerWrapper.tsx
'use client';

import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// Dynamically import the PDF viewer with no SSR
const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => (
    <div className='flex items-center justify-center h-screen bg-gray-100'>
      <div className='text-center'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4'></div>
        <p className='text-gray-600'>Loading PDF Viewer...</p>
      </div>
    </div>
  ),
});

const PDFViewerWrapper: React.FC = () => {
  return <PDFViewer />;
};

export default PDFViewerWrapper;
