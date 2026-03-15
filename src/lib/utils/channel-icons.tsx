import React from 'react';
import { Radio } from 'lucide-react';

/**
 * Returns a colored SVG logo for a media channel
 * @param channelType - The channel type name (e.g., "Google Ads", "Meta Ads", etc.)
 * @param className - Optional className for the SVG (default: "w-5 h-5")
 * @returns React component with colored SVG logo
 */
export function getChannelLogo(channelType: string, className: string = "w-5 h-5"): React.ReactElement {
  const l = channelType.toLowerCase();

  if (l.includes('meta') || l.includes('facebook')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Meta">
        <path d="M12 2.04C6.477 2.04 2 6.516 2 12.04c0 5.012 3.657 9.168 8.438 9.896V14.89h-2.54v-2.851h2.54v-2.17c0-2.509 1.493-3.893 3.775-3.893 1.094 0 2.238.196 2.238.196v2.459h-1.26c-1.243 0-1.63.772-1.63 1.563v1.845h2.773l-.443 2.85h-2.33v7.046C18.343 21.208 22 17.052 22 12.04c0-5.524-4.477-10-10-10z" fill="#1877F2"/>
      </svg>
    );
  }

  if (l.includes('google') || l.includes('google ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-label="Google Ads">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    );
  }

  if (l.includes('linkedin') || l.includes('linkedin ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="LinkedIn">
        <rect width="24" height="24" rx="3" fill="#0A66C2"/>
        <path d="M7.75 9.5h-2.5v8h2.5v-8zM6.5 8.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM17.5 13.25c0-1.938-.938-3.75-3-3.75-1.188 0-2 .625-2.375 1.188V9.5H9.75v8h2.375v-4.375c0-.875.563-1.625 1.438-1.625.875 0 1.187.75 1.187 1.563V17.5H17.5v-4.25z" fill="white"/>
      </svg>
    );
  }

  if (l.includes('tiktok') || l.includes('tiktok ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="TikTok">
        <rect width="24" height="24" rx="4" fill="#010101"/>
        <path d="M17.5 7.5c-.833-.583-1.292-1.542-1.333-2.5H14v9.583c0 1.084-.917 1.917-2 1.834-1.083-.084-1.833-1.084-1.667-2.167.167-1.083 1.167-1.833 2.25-1.666V10.5c-2.583-.25-4.75 1.583-4.75 4.25 0 2.5 2.083 4.25 4.667 4.167C14.917 18.833 17 16.917 17 14.583V9.75c.75.5 1.583.75 2.5.75V8c-.75 0-1.5-.167-2-.5z" fill="white"/>
      </svg>
    );
  }

  if (l.includes('instagram') || l.includes('instagram ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Instagram">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.26 0 12 0zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zM12 16c-2.209 0-4-1.79-4-4s1.791-4 4-4 4 1.79 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="#E4405F"/>
      </svg>
    );
  }

  // Generic fallback
  return <Radio className={className} style={{ color: '#8A8578' }} />;
}
