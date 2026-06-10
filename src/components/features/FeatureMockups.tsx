export function ChannelPerformanceMockup() {
  return (
    <svg viewBox="0 0 560 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Card background */}
      <rect width="560" height="420" rx="16" fill="#FDFCF8" />
      <rect width="560" height="420" rx="16" stroke="#E8E4DC" strokeWidth="1" />

      {/* Header row */}
      {/* Facebook icon circle */}
      <circle cx="36" cy="44" r="18" fill="#1877F2" />
      <text x="36" y="50" textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="sans-serif">f</text>

      {/* Campaign name */}
      <text x="62" y="38" fill="#1C1917" fontSize="12" fontWeight="700" fontFamily="sans-serif">META — APP INSTALLS - ANDROID + 2 MORE</text>
      <text x="62" y="54" fill="#8A8578" fontSize="10" fontFamily="sans-serif">Meta Ads</text>

      {/* Spend right */}
      <text x="540" y="36" textAnchor="end" fill="#1C1917" fontSize="16" fontWeight="700" fontFamily="sans-serif">$11,805</text>
      <text x="540" y="52" textAnchor="end" fill="#8A8578" fontSize="10" fontFamily="sans-serif">of $5,022</text>

      {/* Divider */}
      <line x1="20" y1="72" x2="540" y2="72" stroke="#E8E4DC" strokeWidth="0.5" />

      {/* Pacing label */}
      <text x="24" y="92" fill="#8A8578" fontSize="10" fontFamily="sans-serif">Pacing</text>
      <text x="540" y="92" textAnchor="end" fill="#E53E3E" fontSize="11" fontWeight="700" fontFamily="sans-serif">235% of target</text>

      {/* Pacing bar track */}
      <rect x="24" y="98" width="512" height="8" rx="4" fill="#F0EDE8" />
      {/* Pacing bar fill — overspend so full red */}
      <rect x="24" y="98" width="512" height="8" rx="4" fill="#E53E3E" />
      {/* Target marker */}
      <line x1="241" y1="94" x2="241" y2="110" stroke="#1C1917" strokeWidth="1.5" strokeDasharray="2,2" />

      <text x="24" y="122" fill="#8A8578" fontSize="9" fontFamily="sans-serif">$11,805 spent</text>
      <text x="540" y="122" textAnchor="end" fill="#8A8578" fontSize="9" fontFamily="sans-serif">$5,022 planned</text>

      {/* Divider */}
      <line x1="20" y1="132" x2="540" y2="132" stroke="#E8E4DC" strokeWidth="0.5" />

      {/* Metrics row label */}
      <text x="24" y="152" fill="#1C1917" fontSize="10" fontWeight="600" fontFamily="sans-serif">Awareness</text>

      {/* Metric columns */}
      {/* IMPR */}
      <text x="24" y="175" fill="#8A8578" fontSize="9" fontFamily="sans-serif">IMPR</text>
      <text x="24" y="191" fill="#1C1917" fontSize="14" fontWeight="700" fontFamily="sans-serif">1,055,318</text>
      <text x="24" y="205" fill="#4A7C59" fontSize="9" fontFamily="sans-serif">↑ bm 50,000</text>

      {/* CLICKS */}
      <text x="135" y="175" fill="#8A8578" fontSize="9" fontFamily="sans-serif">CLICKS</text>
      <text x="135" y="191" fill="#1C1917" fontSize="14" fontWeight="700" fontFamily="sans-serif">6,598</text>
      <text x="135" y="205" fill="#4A7C59" fontSize="9" fontFamily="sans-serif">↑ bm 1,000</text>

      {/* CTR */}
      <text x="246" y="175" fill="#8A8578" fontSize="9" fontFamily="sans-serif">CTR</text>
      <text x="246" y="191" fill="#1C1917" fontSize="14" fontWeight="700" fontFamily="sans-serif">0.63%</text>
      <text x="246" y="205" fill="#E53E3E" fontSize="9" fontFamily="sans-serif">↓ bm 1.2%</text>

      {/* CPC */}
      <text x="340" y="175" fill="#8A8578" fontSize="9" fontFamily="sans-serif">CPC</text>
      <text x="340" y="191" fill="#1C1917" fontSize="14" fontWeight="700" fontFamily="sans-serif">$1.79</text>
      <text x="340" y="205" fill="#E53E3E" fontSize="9" fontFamily="sans-serif">↓ bm $1.50</text>

      {/* CONV */}
      <text x="445" y="175" fill="#8A8578" fontSize="9" fontFamily="sans-serif">CONV</text>
      <text x="445" y="191" fill="#1C1917" fontSize="14" fontWeight="700" fontFamily="sans-serif">1,082</text>
      <rect x="443" y="196" width="80" height="16" rx="4" fill="#F0EDE8" />
      <text x="483" y="207" textAnchor="middle" fill="#5C5650" fontSize="8" fontFamily="sans-serif">App Custom E…</text>

      {/* Tab buttons */}
      <rect x="24" y="220" width="64" height="26" rx="6" fill="#1C1917" />
      <text x="56" y="237" textAnchor="middle" fill="white" fontSize="10" fontWeight="600" fontFamily="sans-serif">Spend</text>
      <rect x="96" y="220" width="66" height="26" rx="6" fill="#F0EDE8" />
      <text x="129" y="237" textAnchor="middle" fill="#5C5650" fontSize="10" fontFamily="sans-serif">Metrics</text>

      {/* Open / Report buttons */}
      <rect x="400" y="220" width="62" height="26" rx="6" fill="#F0EDE8" />
      <text x="431" y="237" textAnchor="middle" fill="#5C5650" fontSize="10" fontFamily="sans-serif">↗ Open</text>
      <rect x="470" y="220" width="66" height="26" rx="6" fill="#F0EDE8" />
      <text x="503" y="237" textAnchor="middle" fill="#5C5650" fontSize="10" fontFamily="sans-serif">▤ Report</text>

      {/* Chart area */}
      {/* Y axis labels */}
      <text x="20" y="264" textAnchor="end" fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">$12k</text>
      <text x="20" y="300" textAnchor="end" fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">$9k</text>
      <text x="20" y="336" textAnchor="end" fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">$6k</text>
      <text x="20" y="372" textAnchor="end" fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">$3k</text>
      <text x="20" y="405" textAnchor="end" fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">$0</text>

      {/* Grid lines */}
      <line x1="24" y1="258" x2="540" y2="258" stroke="#E8E4DC" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="24" y1="294" x2="540" y2="294" stroke="#E8E4DC" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="24" y1="330" x2="540" y2="330" stroke="#E8E4DC" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="24" y1="366" x2="540" y2="366" stroke="#E8E4DC" strokeWidth="0.5" strokeDasharray="3,3" />

      {/* Planned spend line (grey, gentle curve) */}
      <path
        d="M28,404 C60,400 100,396 140,390 C180,384 220,375 260,364 C300,353 340,340 380,325 C420,310 460,295 540,278"
        stroke="#C4BFB8"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Actual spend area fill */}
      <path
        d="M28,404 C55,400 80,396 105,390 C130,382 155,370 180,352 C205,334 230,310 255,285 C280,262 305,252 330,248 C355,244 380,244 405,242 C430,240 460,238 540,262 L540,408 L28,408 Z"
        fill="rgba(74,124,89,0.15)"
      />
      {/* Actual spend line */}
      <path
        d="M28,404 C55,400 80,396 105,390 C130,382 155,370 180,352 C205,334 230,310 255,285 C280,262 305,252 330,248 C355,244 380,244 405,242 C430,240 460,238 540,262"
        stroke="#4A7C59"
        strokeWidth="2"
        fill="none"
      />

      {/* Data point dots */}
      {[
        [28,404],[55,400],[82,396],[109,390],[136,382],[163,370],[190,352],
        [217,334],[244,310],[271,285],[298,262],[325,252],[352,248],[379,244],
        [406,242],[433,240],[460,238],[487,248],[514,255],[540,262]
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3" fill="#4A7C59" stroke="white" strokeWidth="1.5" />
      ))}

      {/* X axis labels */}
      {['11','14','17','20','23','26','29','1','4','7','10'].map((label, i) => (
        <text key={i} x={28 + i * 51} y="418" textAnchor="middle" fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">{label}</text>
      ))}
    </svg>
  );
}

export function CPAGaugeMockup({ overTarget = false }: { overTarget?: boolean }) {
  const cpa = overTarget ? 29.77 : 14.46;
  const pctChange = overTarget ? 2.5 : 3.2;
  const changeUp = overTarget;
  const target = 20;

  // Gauge arc: semicircle from 180° to 0° (left to right)
  // needle angle: 0 = left (min ~$10), 180 = right (max ~$35)
  // target at $20 → (20-10)/(35-10) = 40% → 0.4 * 180 = 72° from left
  const minVal = 10;
  const maxVal = 35;
  const needleAngle = ((cpa - minVal) / (maxVal - minVal)) * 180; // degrees from left
  const needleRad = ((180 - needleAngle) * Math.PI) / 180;
  const cx = 460, cy = 155, r = 52;
  const nx = cx + r * Math.cos(needleRad);
  const ny = cy - r * Math.sin(needleRad) + r; // shift down since arc center is at top

  // green portion end angle (at target $20)
  const targetAngle = ((target - minVal) / (maxVal - minVal)) * 180;
  const targetRad = ((180 - targetAngle) * Math.PI) / 180;

  // Green arc: from left (180°) to target
  const greenStartX = cx - r;
  const greenStartY = cy;
  const greenEndX = cx + r * Math.cos(targetRad);
  const greenEndY = cy - r * Math.sin(targetRad) + 0;

  // Red arc: from target to right
  const redEndX = cx + r;
  const redEndY = cy;

  return (
    <svg viewBox="0 0 560 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      <rect width="560" height="220" rx="16" fill="#FDFCF8" />
      <rect width="560" height="220" rx="16" stroke="#E8E4DC" strokeWidth="1" />

      {/* Title */}
      <text x="24" y="36" fill="#C4BFB8" fontSize="11" fontWeight="600" fontFamily="sans-serif" letterSpacing="1">CPA · 7D ROLLING</text>

      {/* Info icon */}
      <circle cx="536" cy="28" r="10" stroke="#C4BFB8" strokeWidth="1" />
      <text x="536" y="32" textAnchor="middle" fill="#C4BFB8" fontSize="10" fontFamily="sans-serif">i</text>

      {/* Chart area — Y axis */}
      <text x="24" y="76" fill="#C4BFB8" fontSize="9" fontFamily="sans-serif">$30.0</text>
      <text x="24" y="112" fill="#C4BFB8" fontSize="9" fontFamily="sans-serif">$20.0</text>
      <text x="24" y="148" fill="#C4BFB8" fontSize="9" fontFamily="sans-serif">$10.0</text>

      {/* Target dashed line at $20 */}
      <line x1="44" y1="110" x2="380" y2="110" stroke="#C4BFB8" strokeWidth="1" strokeDasharray="4,3" />

      {/* Chart area bounds */}
      <clipPath id="chartClip">
        <rect x="44" y="58" width="336" height="130" />
      </clipPath>

      {/* Green area below line */}
      <path
        d={overTarget
          ? "M44,143 C70,143 96,142 122,141 C148,140 174,139 200,137 C226,135 252,133 278,131 C304,125 316,118 332,100 C348,82 364,70 380,60 L380,188 L44,188 Z"
          : "M44,143 C70,143 96,143 122,142 C148,141 174,140 200,139 C226,138 252,136 278,137 C304,138 330,136 356,134 C370,133 374,131 380,128 L380,188 L44,188 Z"
        }
        fill="rgba(74,124,89,0.12)"
        clipPath="url(#chartClip)"
      />

      {/* Red overshoot area */}
      {overTarget && (
        <path
          d="M316,105 C332,88 350,74 380,60 L380,110 L316,110 Z"
          fill="rgba(229,62,62,0.12)"
          clipPath="url(#chartClip)"
        />
      )}

      {/* Line */}
      <path
        d={overTarget
          ? "M44,143 C70,143 96,142 122,141 C148,140 174,139 200,137 C226,135 252,133 278,131 C304,125 316,118 332,100 C348,82 364,70 380,60"
          : "M44,143 C70,143 96,143 122,142 C148,141 174,140 200,139 C226,138 252,136 278,137 C304,138 330,136 356,134 C370,133 374,131 380,128"
        }
        stroke={overTarget ? "#4A7C59" : "#4A7C59"}
        strokeWidth="2"
        fill="none"
        clipPath="url(#chartClip)"
      />

      {/* Red segment if over target */}
      {overTarget && (
        <path
          d="M316,105 C332,88 348,74 380,60"
          stroke="#E53E3E"
          strokeWidth="2"
          fill="none"
          clipPath="url(#chartClip)"
        />
      )}

      {/* End dot */}
      <circle
        cx="380"
        cy={overTarget ? 60 : 128}
        r="5"
        fill={overTarget ? "#E53E3E" : "#4A7C59"}
        stroke="white"
        strokeWidth="1.5"
        clipPath="url(#chartClip)"
      />

      {/* X axis labels */}
      {['12','17','22','27','1','6','10'].map((label, i) => (
        <text key={i} x={44 + i * 56} y="205" textAnchor="middle" fill="#C4BFB8" fontSize="9" fontFamily="sans-serif">{label}</text>
      ))}

      {/* Settings icon */}
      <circle cx="32" cy="198" r="8" stroke="#C4BFB8" strokeWidth="1" fill="none" />
      <circle cx="32" cy="198" r="3" stroke="#C4BFB8" strokeWidth="1" fill="none" />

      {/* --- Gauge (right side) --- */}
      {/* 24H change */}
      <text x="432" y="72" textAnchor="middle" fill={changeUp ? '#E53E3E' : '#4A7C59'} fontSize="22" fontWeight="700" fontFamily="sans-serif">
        {changeUp ? '↑' : '↓'}
      </text>
      <text x="432" y="92" textAnchor="middle" fill={changeUp ? '#E53E3E' : '#4A7C59'} fontSize="14" fontWeight="700" fontFamily="sans-serif">
        {pctChange}%
      </text>
      <text x="432" y="106" textAnchor="middle" fill="#C4BFB8" fontSize="9" fontFamily="sans-serif">24H</text>

      {/* Gauge arc background (grey) */}
      <path
        d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`}
        stroke="#E8E4DC"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Green arc up to target */}
      <path
        d={`M ${cx - r},${cy} A ${r},${r} 0 0,1 ${greenEndX},${greenEndY}`}
        stroke="#4A7C59"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Red arc from target to end if over */}
      {overTarget && (
        <path
          d={`M ${greenEndX},${greenEndY} A ${r},${r} 0 0,1 ${redEndX},${redEndY}`}
          stroke="#E53E3E"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
        />
      )}

      {/* Needle */}
      {(() => {
        const rad = ((180 - needleAngle) * Math.PI) / 180;
        const ex = cx + (r - 10) * Math.cos(rad);
        const ey = cy - (r - 10) * Math.sin(rad);
        return (
          <>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={overTarget ? "#E53E3E" : "#1C1917"} strokeWidth="2" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="4" fill="#1C1917" />
          </>
        );
      })()}

      {/* Needle end dot */}
      {overTarget && (() => {
        const rad = ((180 - needleAngle) * Math.PI) / 180;
        const ex = cx + (r - 10) * Math.cos(rad);
        const ey = cy - (r - 10) * Math.sin(rad);
        return <circle cx={ex} cy={ey} r="5" fill="#E53E3E" />;
      })()}

      {/* CPA label */}
      <text x={cx} y={cy + 22} textAnchor="middle" fill="#1C1917" fontSize="14" fontWeight="700" fontFamily="sans-serif">
        ${cpa.toFixed(2)}
      </text>
      <text x={cx} y={cy + 35} textAnchor="middle" fill="#4A7C59" fontSize="9" fontWeight="600" fontFamily="sans-serif">CPA</text>
    </svg>
  );
}

export function MediaPlanMockup() {
  const channels = [
    { name: 'LETTERBOX DROPS', total: null, color: '#9B59B6', startCol: 4, span: 4 },
    { name: 'OOH / ONLINE ACTIVITY', total: '$20,000', color: '#2563EB', startCol: 4, span: 4, label: '$10,000' },
    { name: 'RADIO', total: '$12,000', color: '#E8703A', startCol: 4, span: 4, label: '$6,000' },
    { name: 'TRADE ME', total: '$7,000', color: '#E8703A', startCol: 4, span: 2, label: null },
    { name: 'META', total: '$12,000', color: '#E8A020', startCol: 4, span: 4, label: '$1,000' },
    { name: 'BUS BACKS', total: '$12,800', color: '#D63884', startCol: 4, span: 4, label: '$6,400' },
    { name: 'SEARCH', total: '$34,000', color: '#0D9488', startCol: 0, span: 12, label: '$2,750' },
  ];

  const months = ['JAN', 'FEB', 'MAR', 'APR'];
  const colWidth = 36;
  const rowHeight = 36;
  const labelWidth = 160;
  const totalWidth = 60;
  const headerHeight = 52;
  const startX = labelWidth + totalWidth + 8;

  return (
    <svg viewBox={`0 0 ${startX + 12 * colWidth + 20} ${headerHeight + channels.length * rowHeight + 16}`} fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Background */}
      <rect width={startX + 12 * colWidth + 20} height={headerHeight + channels.length * rowHeight + 16} rx="12" fill="#FDFCF8" />

      {/* Header bar */}
      <rect x="0" y="0" width={startX + 12 * colWidth + 20} height={headerHeight} rx="12" fill="#1C1917" />
      <rect x="0" y={headerHeight - 10} width={startX + 12 * colWidth + 20} height={10} fill="#1C1917" />

      {/* Month headers */}
      {months.map((month, mi) => {
        const monthX = startX + mi * 3 * colWidth;
        const monthW = 3 * colWidth;
        return (
          <g key={month}>
            <text x={monthX + monthW / 2} y="22" textAnchor="middle" fill="#F5F3EF" fontSize="10" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
              {month}
            </text>
            {/* Week sub-labels */}
            {[0, 1, 2].map((w) => (
              <text key={w} x={monthX + w * colWidth + colWidth / 2} y="42" textAnchor="middle" fill="#8A8578" fontSize="7" fontFamily="sans-serif">
                {mi === 0 ? ['5-Jan', '12-Jan', '19-Jan'][w] : mi === 1 ? ['2-Feb', '9-Feb', '16-Feb'][w] : mi === 2 ? ['2-Mar', '9-Mar', '16-Mar'][w] : ['30-Mar', '6-Apr', '13-Apr'][w]}
              </text>
            ))}
            {/* month divider */}
            {mi > 0 && <line x1={monthX} y1="0" x2={monthX} y2={headerHeight} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />}
          </g>
        );
      })}

      {/* Column header labels */}
      <rect x="0" y="0" width={labelWidth} height={headerHeight} rx="0" fill="#1C1917" />
      <text x="12" y="30" fill="#F5F3EF" fontSize="9" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">CHANNEL</text>
      <text x={labelWidth + totalWidth / 2} y="30" textAnchor="middle" fill="#F5F3EF" fontSize="9" fontWeight="700" fontFamily="sans-serif">TOTAL</text>

      {/* Rows */}
      {channels.map((ch, ri) => {
        const y = headerHeight + ri * rowHeight;
        const barX = startX + ch.startCol * colWidth;
        const barW = ch.span * colWidth - 4;

        return (
          <g key={ch.name}>
            {/* Row bg alternating */}
            <rect x="0" y={y} width={startX + 12 * colWidth + 20} height={rowHeight} fill={ri % 2 === 0 ? '#FDFCF8' : '#F8F6F2'} />

            {/* Channel name */}
            <text x="12" y={y + rowHeight / 2 + 4} fill="#3C3836" fontSize="9" fontWeight="600" fontFamily="sans-serif">{ch.name}</text>

            {/* Total */}
            {ch.total && (
              <text x={labelWidth + totalWidth / 2} y={y + rowHeight / 2 + 4} textAnchor="middle" fill="#5C5650" fontSize="9" fontFamily="sans-serif">{ch.total}</text>
            )}

            {/* Gantt bar */}
            <rect x={barX} y={y + 6} width={barW} height={rowHeight - 12} rx="4" fill={ch.color} />
            {ch.label && (
              <text x={barX + barW / 2} y={y + rowHeight / 2 + 4} textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="sans-serif">{ch.label}</text>
            )}
          </g>
        );
      })}

      {/* Row dividers */}
      {channels.map((_, ri) => (
        <line key={ri} x1="0" y1={headerHeight + (ri + 1) * rowHeight} x2={startX + 12 * colWidth + 20} y2={headerHeight + (ri + 1) * rowHeight} stroke="#E8E4DC" strokeWidth="0.5" />
      ))}

      {/* Vertical grid lines for weeks */}
      {Array.from({ length: 13 }).map((_, i) => (
        <line key={i} x1={startX + i * colWidth} y1={headerHeight} x2={startX + i * colWidth} y2={headerHeight + channels.length * rowHeight + 16} stroke="#E8E4DC" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

export function ActionPointsMockup() {
  const items = [
    { text: 'Review frequency by ad set — pause or refresh creatives above 3.0', freq: null },
    { text: 'Check audience overlap between ad sets using Audience Insights', freq: null },
    { text: 'Verify Meta Pixel is firing on key conversion events', freq: 'weekly' },
  ];

  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      <rect width="280" height="220" rx="12" fill="#FDFCF8" />
      <rect width="280" height="220" rx="12" stroke="#E8E4DC" strokeWidth="1" />

      {/* Header */}
      <text x="16" y="28" fill="#1C1917" fontSize="13" fontWeight="700" fontFamily="sans-serif">Action Points</text>
      <text x="16" y="46" fill="#3B82F6" fontSize="10" fontFamily="sans-serif">+ Add</text>

      <line x1="16" y1="54" x2="264" y2="54" stroke="#E8E4DC" strokeWidth="0.5" />

      {/* Section label */}
      <text x="16" y="70" fill="#8A8578" fontSize="8" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">HEALTH CHECK</text>

      {/* Items */}
      {items.map((item, i) => {
        const y = 82 + i * 46;
        // Break text into two lines
        const words = item.text.split(' ');
        const mid = Math.ceil(words.length / 2);
        const line1 = words.slice(0, mid).join(' ');
        const line2 = words.slice(mid).join(' ');
        return (
          <g key={i}>
            <circle cx="26" cy={y + 10} r="7" stroke="#C4BFB8" strokeWidth="1.5" fill="none" />
            <text x="40" y={y + 10} fill="#3C3836" fontSize="9" fontFamily="sans-serif">{line1}</text>
            <text x="40" y={y + 22} fill="#3C3836" fontSize="9" fontFamily="sans-serif">{line2}</text>
            {item.freq && (
              <text x="40" y={y + 36} fill="#C4BFB8" fontSize="8" fontFamily="sans-serif">{item.freq}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
