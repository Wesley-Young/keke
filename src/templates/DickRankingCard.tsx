export interface DickRankingEntry {
  rank: number;
  nickname: string;
  userId: number | string;
  length: number;
}

export interface DickRankingCardProps {
  positiveEntries: readonly DickRankingEntry[];
  negativeEntries: readonly DickRankingEntry[];
}

type DickRankingSide = 'positive' | 'negative';

interface DickRankingBarRowProps {
  entry: DickRankingEntry;
  side: DickRankingSide;
  maxAbsLength: number;
}

const CHART_MAX_BAR_WIDTH = 250;

function formatLength(length: number): string {
  const absolute = Math.trunc(Math.abs(length));
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  const sign = length < 0 ? '-' : '';

  return `${sign}${whole}.${fraction}cm`;
}

function getDisplayName(entry: DickRankingEntry): string {
  const nickname = entry.nickname.trim();

  return nickname || `QQ ${entry.userId}`;
}

function DickRankingBarRow({
  entry,
  side,
  maxAbsLength,
}: DickRankingBarRowProps) {
  const isPositive = side === 'positive';
  const barWidth = Math.max(
    18,
    Math.round((CHART_MAX_BAR_WIDTH * Math.abs(entry.length)) / maxAbsLength),
  );
  const accentColor = isPositive ? '#1f8f50' : '#c84561';
  const barColor = isPositive ? '#2ea95f' : '#eb5875';

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 56,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          gridColumn: isPositive ? 2 : 1,
          justifySelf: isPositive ? 'start' : 'end',
          width: '100%',
          maxWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isPositive ? 'flex-start' : 'flex-end',
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            paddingLeft: isPositive ? 8 : 0,
            paddingRight: isPositive ? 0 : 8,
            flexDirection: 'column',
            gap: 2,
            textAlign: isPositive ? 'left' : 'right',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: isPositive ? 'row' : 'row-reverse',
              alignItems: 'baseline',
              gap: 8,
              minWidth: 0,
            }}
          >
            <span
              style={{
                color: '#667085',
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              #{entry.rank}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {getDisplayName(entry)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: isPositive ? 'row' : 'row-reverse',
              gap: 10,
              color: '#667085',
              fontFamily: 'Roboto Mono',
              fontSize: 13,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: accentColor, fontWeight: 700 }}>
              {formatLength(entry.length)}
            </span>
            <span>QQ {entry.userId}</span>
          </div>
        </div>

        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: isPositive ? 'flex-start' : 'flex-end',
            marginTop: 6,
          }}
        >
          <div
            style={{
              width: barWidth,
              height: 18,
              backgroundColor: barColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function DickRankingCard({
  positiveEntries,
  negativeEntries,
}: DickRankingCardProps) {
  const maxAbsLength = Math.max(
    1,
    ...positiveEntries.map((entry) => Math.abs(entry.length)),
    ...negativeEntries.map((entry) => Math.abs(entry.length)),
  );
  const sortedNegativeEntries = [...negativeEntries].sort((a, b) => {
    const absDiff = Math.abs(a.length) - Math.abs(b.length);
    if (absDiff !== 0) {
      return absDiff;
    }

    return b.length - a.length;
  });
  const rankingEntries = [
    ...positiveEntries.map((entry) => ({
      entry,
      side: 'positive' as const,
    })),
    ...sortedNegativeEntries.map((entry) => ({
      entry,
      side: 'negative' as const,
    })),
  ];

  return (
    <div
      style={{
        width: 720,
        backgroundColor: '#fff',
        color: '#1f2933',
        fontFamily: 'Inter, Noto Sans SC',
        padding: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '3px solid #24313d',
          paddingBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 17,
              color: '#ef6f6c',
              marginBottom: 4,
            }}
          >
            正负 TOP 5
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            牛牛排行榜
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 6,
            paddingTop: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#667085',
              fontSize: 14,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                backgroundColor: '#2ea95f',
                display: 'inline-block',
              }}
            />
            正长度
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#667085',
              fontSize: 14,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                backgroundColor: '#eb5875',
                display: 'inline-block',
              }}
            />
            负长度
          </div>
        </div>
      </div>

      <section
        style={{
          backgroundColor: '#f8fafc',
          border: '2px solid #dbe3ee',
          borderRadius: 8,
          marginTop: 22,
          padding: 18,
        }}
      >
        <div
          style={{
            position: 'relative',
            minHeight: 620,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 2,
              marginLeft: -1,
              backgroundColor: '#24313d',
              opacity: 0.18,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {rankingEntries.map(({ entry, side }) => (
              <DickRankingBarRow
                key={`${side}-${entry.rank}-${entry.userId}`}
                entry={entry}
                side={side}
                maxAbsLength={maxAbsLength}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export const previewProps: DickRankingCardProps = {
  positiveEntries: [
    { rank: 1, nickname: 'T4kum1', userId: 10001, length: 1688 },
    { rank: 2, nickname: '椰奶冰', userId: 10002, length: 1420 },
    { rank: 3, nickname: '小羊不会睡', userId: 10003, length: 1260 },
    { rank: 4, nickname: 'Mint', userId: 10004, length: 910 },
    { rank: 5, nickname: 'Aki', userId: 10005, length: 620 },
  ],
  negativeEntries: [
    { rank: 5, nickname: '阿澈', userId: 20005, length: -510 },
    { rank: 4, nickname: 'Mori', userId: 20004, length: -740 },
    { rank: 3, nickname: 'Sora', userId: 20003, length: -980 },
    { rank: 2, nickname: '白糖汽水', userId: 20002, length: -1310 },
    { rank: 1, nickname: '夜航船', userId: 20001, length: -1660 },
  ],
};
