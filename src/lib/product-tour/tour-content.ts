import {
  Brain,
  LayoutGrid,
  Gauge,
  FileSpreadsheet,
  Share2,
  Layers,
  type LucideIcon,
} from 'lucide-react';

export type TourSectionId = 'agency' | 'client-dashboard' | 'library';

export interface TourSlideMedia {
  type: 'image' | 'video';
  src: string;
  /** When 'side', the slide's title/description render beside the media instead of above it. */
  layout?: 'side';
  /** When 'sm', the media renders at a reduced, capped width instead of filling its container. */
  size?: 'sm';
}

export interface TourSlide {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** When set, the spotlight tour shows this screenshot/video in a static callout instead of navigating to and spotlighting a live element. */
  media?: TourSlideMedia;
}

/** Placeholder swapped for a real client id when resolving the client-dashboard section's route. */
export const CLIENT_ID_PLACEHOLDER = '__CLIENT_ID__';

export interface TourSection {
  id: TourSectionId;
  label: string;
  accentColor: string;
  /** App route where this section's slides live. May contain CLIENT_ID_PLACEHOLDER. */
  route: string;
  slides: TourSlide[];
}

/** CSS selector for the live DOM element a given slide should spotlight. */
export function getTourTargetSelector(slideId: string): string {
  return `[data-tour-id="${slideId}"]`;
}

export const TOUR_SECTIONS: TourSection[] = [
  {
    id: 'agency',
    label: 'Agency',
    accentColor: '#4A6580',
    route: '/agency',
    slides: [
      {
        id: 'agency-ai-chat',
        title: 'Run your workflow\nwith AI Agents',
        description:
          'Get a daily briefing, ask any questions about clients and tasks, or activate an AI Agent to create invoices, edit media plans or manage to do lists.',
        icon: Brain,
        media: { type: 'image', src: '/ai-chat.png', layout: 'side', size: 'sm' },
      },
      {
        id: 'agency-clients-todo-timeline',
        title: "Manage your to do list + your team's workload",
        description:
          'Assign tasks to team members & switch between your client list, task board, and media plan timelines',
        icon: LayoutGrid,
        media: { type: 'image', src: '/todo-list.png', size: 'sm' },
      },
    ],
  },
  {
    id: 'client-dashboard',
    label: 'Client Dashboard',
    accentColor: '#4A7C59',
    route: `/clients/${CLIENT_ID_PLACEHOLDER}/dashboard`,
    slides: [
      {
        id: 'client-hero',
        title: 'Keep on top of every client',
        description:
          'Catch problems before they cost you - Compare your media plan to live metrics and never miss a step with your clients.',
        icon: Gauge,
        media: { type: 'image', src: '/client-card.png' },
      },
      {
        id: 'client-media-plan-tab',
        title: 'Media plan, built or imported',
        description:
          'An editable weekly-budget grid — or use the Upload Wizard to import a plan from a screenshot, paste, or spreadsheet.',
        icon: FileSpreadsheet,
        media: { type: 'image', src: '/media-plan.png' },
      },
      {
        id: 'client-portal-share',
        title: 'Share a client-facing portal',
        description:
          'The Client Portal shortcut gives each client their own shareable hub link, with sections you control — including funnels and cost-per-metric charts.',
        icon: Share2,
        media: { type: 'video', src: '/client-portal.mp4' },
      },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    accentColor: '#B07030',
    route: '/library',
    slides: [
      {
        id: 'library-channels',
        title: 'Channel library: action points & specs',
        description:
          'Expandable entries per media channel, covering setup and health-check action points plus creative specs.',
        icon: Layers,
      },
    ],
  },
];

export interface FlatTourSlide {
  section: TourSection;
  slide: TourSlide;
  sectionIndex: number;
  slideIndexInSection: number;
  flatIndex: number;
}

export const TOUR_SLIDES_FLAT: FlatTourSlide[] = (() => {
  const flat: FlatTourSlide[] = [];
  TOUR_SECTIONS.forEach((section, sectionIndex) => {
    section.slides.forEach((slide, slideIndexInSection) => {
      flat.push({
        section,
        slide,
        sectionIndex,
        slideIndexInSection,
        flatIndex: flat.length,
      });
    });
  });
  return flat;
})();

export function getSectionFirstFlatIndex(sectionId: TourSectionId): number {
  const index = TOUR_SLIDES_FLAT.findIndex((entry) => entry.section.id === sectionId);
  return index === -1 ? 0 : index;
}
