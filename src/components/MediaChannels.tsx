'use client';

import MediaChannelCard from './MediaChannelCard';
import { Facebook, Search, Linkedin, Music } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';

export default function MediaChannels() {
  // Generate sample data for current month
  const generateMonthData = (monthBudget: number, actualDaysData: { day: number; spend: number }[]) => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const dailyTarget = monthBudget / allDays.length;
    
    return allDays.map((date, index) => {
      const dayOfMonth = date.getDate();
      const actualData = actualDaysData.find(d => d.day === dayOfMonth);
      
      return {
        date: format(date, 'yyyy-MM-dd'),
        actualSpend: actualData ? actualData.spend : null,
        targetSpend: dailyTarget * (index + 1), // Cumulative target
        projected: false
      };
    });
  };

  const channels = [
    {
      id: 'meta',
      name: 'Meta Ads',
      icon: <Facebook className="w-6 h-6 text-blue-600" />,
      status: 'Active' as const,
      monthBudget: 50000,
      actionPoints: [
        { id: 'meta-1', text: 'Review audience overlap in campaign groups', completed: false },
        { id: 'meta-2', text: 'Update creative assets for underperforming ads', completed: true },
        { id: 'meta-3', text: 'Analyze conversion rates by placement', completed: false },
        { id: 'meta-4', text: 'Test new lookalike audiences', completed: false },
      ],
      spendData: generateMonthData(50000, [
        { day: 1, spend: 1500 },
        { day: 2, spend: 3200 },
        { day: 3, spend: 5100 },
        { day: 4, spend: 6800 },
        { day: 5, spend: 8600 },
        { day: 6, spend: 10500 },
        { day: 7, spend: 12200 },
        { day: 8, spend: 14100 },
        { day: 9, spend: 16300 },
        { day: 10, spend: 18200 },
        { day: 11, spend: 20400 },
        { day: 12, spend: 22100 },
        { day: 13, spend: 24500 },
        { day: 14, spend: 26800 },
        { day: 15, spend: 29200 },
        { day: 16, spend: 31500 },
        { day: 17, spend: 33900 },
        { day: 18, spend: 36200 },
        { day: 19, spend: 38700 },
        { day: 20, spend: 41100 },
      ])
    },
    {
      id: 'google',
      name: 'Google Ads',
      icon: <Search className="w-6 h-6 text-red-600" />,
      status: 'Review' as const,
      monthBudget: 75000,
      actionPoints: [
        { id: 'google-1', text: 'Optimize keyword bids for top performers', completed: false },
        { id: 'google-2', text: 'Review search term reports and add negatives', completed: false },
        { id: 'google-3', text: 'A/B test new ad copy variations', completed: true },
        { id: 'google-4', text: 'Adjust budget allocation across campaigns', completed: false },
      ],
      spendData: generateMonthData(75000, [
        { day: 1, spend: 2100 },
        { day: 2, spend: 4500 },
        { day: 3, spend: 7200 },
        { day: 4, spend: 9800 },
        { day: 5, spend: 12600 },
        { day: 6, spend: 15100 },
        { day: 7, spend: 17900 },
        { day: 8, spend: 20500 },
        { day: 9, spend: 23400 },
        { day: 10, spend: 26200 },
        { day: 11, spend: 29100 },
        { day: 12, spend: 32000 },
        { day: 13, spend: 35200 },
        { day: 14, spend: 38500 },
        { day: 15, spend: 41800 },
        { day: 16, spend: 45300 },
        { day: 17, spend: 48900 },
        { day: 18, spend: 52400 },
        { day: 19, spend: 56100 },
        { day: 20, spend: 59800 },
      ])
    },
    {
      id: 'linkedin',
      name: 'LinkedIn Ads',
      icon: <Linkedin className="w-6 h-6 text-blue-700" />,
      status: 'Active' as const,
      monthBudget: 30000,
      actionPoints: [
        { id: 'linkedin-1', text: 'Refine job title targeting parameters', completed: true },
        { id: 'linkedin-2', text: 'Test sponsored content vs message ads', completed: false },
        { id: 'linkedin-3', text: 'Update company size filters', completed: false },
        { id: 'linkedin-4', text: 'Review lead quality and adjust targeting', completed: false },
      ],
      spendData: generateMonthData(30000, [
        { day: 1, spend: 800 },
        { day: 2, spend: 1700 },
        { day: 3, spend: 2600 },
        { day: 4, spend: 3400 },
        { day: 5, spend: 4300 },
        { day: 6, spend: 5100 },
        { day: 7, spend: 6000 },
        { day: 8, spend: 6800 },
        { day: 9, spend: 7700 },
        { day: 10, spend: 8500 },
        { day: 11, spend: 9400 },
        { day: 12, spend: 10200 },
        { day: 13, spend: 11100 },
        { day: 14, spend: 11900 },
        { day: 15, spend: 12800 },
        { day: 16, spend: 13600 },
        { day: 17, spend: 14500 },
        { day: 18, spend: 15300 },
        { day: 19, spend: 16200 },
        { day: 20, spend: 17000 },
      ])
    },
    {
      id: 'tiktok',
      name: 'TikTok Ads',
      icon: <Music className="w-6 h-6 text-black" />,
      status: 'Paused' as const,
      monthBudget: 25000,
      actionPoints: [
        { id: 'tiktok-1', text: 'Create new video creative for Gen Z audience', completed: false },
        { id: 'tiktok-2', text: 'Test different video lengths (15s vs 30s)', completed: false },
        { id: 'tiktok-3', text: 'Analyze engagement metrics by time of day', completed: true },
        { id: 'tiktok-4', text: 'Explore spark ads vs standard ads', completed: false },
      ],
      spendData: generateMonthData(25000, [
        { day: 1, spend: 650 },
        { day: 2, spend: 1400 },
        { day: 3, spend: 2200 },
        { day: 4, spend: 2900 },
        { day: 5, spend: 3700 },
        { day: 6, spend: 4500 },
        { day: 7, spend: 5300 },
        { day: 8, spend: 6100 },
        { day: 9, spend: 6800 },
        { day: 10, spend: 7600 },
        { day: 11, spend: 8400 },
        { day: 12, spend: 9200 },
        { day: 13, spend: 9900 },
        { day: 14, spend: 10700 },
        { day: 15, spend: 11500 },
      ])
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-[#0f172a]">Media Channels</h2>
        <p className="text-sm text-[#64748b]">{channels.length} channels active</p>
      </div>
      
      {channels.map((channel) => (
        <MediaChannelCard key={channel.id} channel={channel} />
      ))}
    </div>
  );
}

