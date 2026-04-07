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

  if (l.includes('youtube') || l.includes('youtube ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="YouTube">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FF0000"/>
      </svg>
    );
  }

  if (l.includes('pinterest') || l.includes('pinterest ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Pinterest">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" fill="#E60023"/>
      </svg>
    );
  }

  if (l.includes('snapchat') || l.includes('snapchat ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Snapchat">
        <path d="M12.017 0C8.396 0 7.918.016 6.703.072 5.49.127 4.668.305 3.95.577a6.016 6.016 0 00-2.177 1.418A6.016 6.016 0 00.355 4.172C.083 4.89-.095 5.712-.15 6.925-.206 8.14-.222 8.618-.222 12.239c0 3.621.016 4.098.072 5.314.055 1.213.233 2.035.505 2.753a6.016 6.016 0 001.418 2.177 6.016 6.016 0 002.177 1.418c.718.272 1.54.45 2.753.505C7.918 24.462 8.396 24.478 12.017 24.478c3.621 0 4.098-.016 5.314-.072 1.213-.055 2.035-.233 2.753-.505a6.016 6.016 0 002.177-1.418 6.016 6.016 0 001.418-2.177c.272-.718.45-1.54.505-2.753.056-1.216.072-1.693.072-5.314 0-3.621-.016-4.098-.072-5.314-.055-1.213-.233-2.035-.505-2.753a6.016 6.016 0 00-1.418-2.177A6.016 6.016 0 0020.084.577C19.366.305 18.544.127 17.331.072 16.115.016 15.638 0 12.017 0zm0 2.16c3.562 0 3.985.014 5.39.078 1.3.059 2.006.277 2.476.46.622.242 1.066.531 1.533.998.467.467.756.911.998 1.533.183.47.401 1.176.46 2.476.064 1.405.078 1.828.078 5.39 0 3.562-.014 3.985-.078 5.39-.059 1.3-.277 2.006-.46 2.476-.242.622-.531 1.066-.998 1.533-.467.467-.911.756-1.533.998-.47.183-1.176.401-2.476.46-1.405.064-1.828.078-5.39.078-3.562 0-3.985-.014-5.39-.078-1.3-.059-2.006-.277-2.476-.46a4.123 4.123 0 01-1.533-.998 4.123 4.123 0 01-.998-1.533c-.183-.47-.401-1.176-.46-2.476-.064-1.405-.078-1.828-.078-5.39 0-3.562.014-3.985.078-5.39.059-1.3.277-2.006.46-2.476.242-.622.531-1.066.998-1.533a4.123 4.123 0 011.533-.998c.47-.183 1.176-.401 2.476-.46 1.405-.064 1.828-.078 5.39-.078z" fill="#FFFC00"/>
        <path d="M12.017 6.123a6.116 6.116 0 100 12.232 6.116 6.116 0 000-12.232zm0 10.083a3.967 3.967 0 110-7.934 3.967 3.967 0 010 7.934zM19.846 5.875a1.43 1.43 0 11-2.86 0 1.43 1.43 0 012.86 0z" fill="#FFFC00"/>
      </svg>
    );
  }

  if (l.includes('twitter') || l.includes(' x ') || l.includes('x ads') || l.includes('x-ads') || (l === 'x')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="X / Twitter">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" fill="#000000"/>
      </svg>
    );
  }

  if (l.includes('programmatic') || l.includes('display') || l.includes('dv360') || l.includes('trade desk')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Programmatic">
        <rect width="24" height="24" rx="4" fill="#5C6BC0"/>
        <path d="M5 7h14M5 12h14M5 17h8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }

  if (l.includes('linear tv') || l.includes('linear-tv') || l.includes('svod') || l.includes('bvod') || l === 'tv' || l.includes('television')) {
    // Pick a shade based on sub-type
    const tvColor = l.includes('svod') ? '#9333EA' : l.includes('bvod') ? '#A855F7' : '#7C3AED';
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="TV">
        <rect x="2" y="4" width="20" height="14" rx="2" fill={tvColor}/>
        <path d="M8 22h8M12 18v4" stroke={tvColor} strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="5" y="7" width="14" height="8" rx="1" fill="white" fillOpacity="0.25"/>
      </svg>
    );
  }

  if (l.includes('search') && !l.includes('google') && !l.includes('bing') && !l.includes('microsoft')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Search">
        <circle cx="11" cy="11" r="7" stroke="#4285F4" strokeWidth="2"/>
        <path d="M16.5 16.5L21 21" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }

  if (l.includes('bing') || l.includes('microsoft ads')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Microsoft/Bing Ads">
        <path d="M5 3l5.5 2.2v10.8L5 18.8V3z" fill="#F25022"/>
        <path d="M10.5 5.2L16 7.4v6.6l-5.5 2.8V5.2z" fill="#7FBA00"/>
        <path d="M16 7.4l5.5 2.2v4.2L16 16V7.4z" fill="#00A4EF"/>
      </svg>
    );
  }

  // Generic fallback
  return <Radio className={className} style={{ color: '#8A8578' }} />;
}
