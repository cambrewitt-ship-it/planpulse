'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t bg-white mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            © {new Date().getFullYear()} OneOneThree Digital Ltd. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <Link 
              href="/terms" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Terms
            </Link>
            <Link 
              href="/privacy" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

